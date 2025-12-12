const { getCompanyFilings } = require('./esef-api.js');
const { downloadAndParseXBRL, findDimensionalFacts } = require('./xbrl-parser.js');
const { formatCurrency, extractGeographyFromDimensions, extractSegmentFromDimensions } = require('./fact-table-builder.js');
const axios = require('axios');

/**
 * Perform time-series dimensional analysis across multiple periods
 * Adapted from SEC server for IFRS/ESEF filings
 *
 * @param {string} lei - Company LEI or entity ID
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Time-series analysis with growth rates and trends
 */
async function timeSeriesAnalysis(lei, options = {}) {
  const defaultOptions = {
    concept: 'Revenue', // IFRS concept to track
    periods: 4, // Number of periods to analyze
    includeGeography: true,
    includeSegments: true,
    showGrowthRates: true,
    minValue: 0,
    maxValue: Number.MAX_SAFE_INTEGER
  };

  const analysisOptions = { ...defaultOptions, ...options };

  try {
    // 1. Get recent filings
    const filings = await getCompanyFilings(lei, {
      limit: analysisOptions.periods * 3 // Get extra in case some fail
    });

    if (!filings.filings || filings.filings.length === 0) {
      throw new Error('No filings found for company');
    }

    // 2. Extract facts from each period
    const periodData = [];
    let processedCount = 0;

    for (let i = 0; i < filings.filings.length && processedCount < analysisOptions.periods; i++) {
      const filing = filings.filings[i];

      try {
        // Get filing details
        const filingUrl = `https://filings.xbrl.org/api/filings/${filing.filing_id}`;
        const filingResponse = await axios.get(filingUrl, {
          headers: { 'Accept': 'application/vnd.api+json' }
        });

        const filingAttrs = filingResponse.data.data.attributes;

        if (!filingAttrs.json_url) {
          continue; // Skip filings without XBRL JSON
        }

        // Download and parse XBRL
        const jsonUrl = `https://filings.xbrl.org${filingAttrs.json_url}`;
        const xbrlData = await downloadAndParseXBRL(jsonUrl, 'json');

        // Search for the concept
        const searchCriteria = {
          concept: analysisOptions.concept,
          valueRange: {
            min: analysisOptions.minValue,
            max: analysisOptions.maxValue
          }
        };

        const facts = findDimensionalFacts(xbrlData, searchCriteria);

        if (facts.length > 0) {
          const enrichedFacts = facts.map(fact => ({
            ...fact,
            geography: extractGeographyFromDimensions(fact.dimensions) || 'Total',
            segment: extractSegmentFromDimensions(fact.dimensions) || 'Total'
          }));

          periodData.push({
            period: filing.period_end,
            filing_id: filing.filing_id,
            filing_date: filing.processed,
            country: filing.country,
            facts: enrichedFacts
          });

          processedCount++;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        // Skip failed periods
        continue;
      }
    }

    if (periodData.length === 0) {
      throw new Error(`No valid period data found for concept: ${analysisOptions.concept}`);
    }

    // 3. Build time series table
    const timeSeriesTable = buildTimeSeriesTable(periodData, analysisOptions);

    // 4. Calculate growth rates
    let growthAnalysis = null;
    if (analysisOptions.showGrowthRates && periodData.length >= 2) {
      growthAnalysis = calculateGrowthRates(timeSeriesTable, periodData);
    }

    // 5. Analyze geographic/segment mix
    let mixAnalysis = null;
    if (analysisOptions.includeGeography || analysisOptions.includeSegments) {
      mixAnalysis = analyzeMix(timeSeriesTable, analysisOptions);
    }

    // 6. Calculate trends
    const trends = calculateTrends(timeSeriesTable);

    return {
      company: lei,
      concept: analysisOptions.concept,
      periods: periodData.map(p => p.period).sort(),
      periodsAnalyzed: periodData.length,
      timeSeries: timeSeriesTable,
      growthAnalysis,
      mixAnalysis,
      trends,
      summary: {
        totalPeriods: periodData.length,
        totalDataPoints: timeSeriesTable.length,
        dateRange: {
          from: periodData[periodData.length - 1]?.period,
          to: periodData[0]?.period
        },
        uniqueGeographies: [...new Set(timeSeriesTable.map(t => t.geography))],
        uniqueSegments: [...new Set(timeSeriesTable.map(t => t.segment))]
      },
      source: 'ESEF Time-Series Dimensional Analysis'
    };

  } catch (error) {
    throw new Error(`Time-series analysis failed: ${error.message}`);
  }
}

/**
 * Build time series table from period data
 */
function buildTimeSeriesTable(periodData, options) {
  const table = [];

  periodData.forEach(period => {
    period.facts.forEach(fact => {
      table.push({
        period: period.period,
        filing_id: period.filing_id,
        country: period.country,
        concept: fact.concept,
        value: fact.value,
        valueFormatted: formatCurrency(fact.value),
        geography: fact.geography,
        segment: fact.segment,
        periodType: fact.periodType,
        periodStart: fact.periodStart,
        periodEnd: fact.periodEnd,
        dimensions: fact.dimensions,
        dimensionCount: Object.keys(fact.dimensions || {}).length
      });
    });
  });

  // Sort by period (newest first), then by value
  table.sort((a, b) => {
    const periodCompare = b.period.localeCompare(a.period);
    if (periodCompare !== 0) return periodCompare;
    return b.value - a.value;
  });

  return table;
}

/**
 * Calculate period-over-period growth rates
 */
function calculateGrowthRates(timeSeries, periodData) {
  const periods = periodData.map(p => p.period).sort();

  if (periods.length < 2) {
    return null;
  }

  const growthRates = [];

  for (let i = 0; i < periods.length - 1; i++) {
    const currentPeriod = periods[i];
    const priorPeriod = periods[i + 1];

    const currentData = timeSeries.filter(t => t.period === currentPeriod);
    const priorData = timeSeries.filter(t => t.period === priorPeriod);

    // Calculate growth by geography
    const geographies = [...new Set([
      ...currentData.map(d => d.geography),
      ...priorData.map(d => d.geography)
    ])];

    geographies.forEach(geo => {
      const currentValue = currentData
        .filter(d => d.geography === geo)
        .reduce((sum, d) => sum + d.value, 0);

      const priorValue = priorData
        .filter(d => d.geography === geo)
        .reduce((sum, d) => sum + d.value, 0);

      if (priorValue > 0) {
        const growthRate = ((currentValue - priorValue) / priorValue) * 100;
        const absoluteChange = currentValue - priorValue;

        growthRates.push({
          from: priorPeriod,
          to: currentPeriod,
          geography: geo,
          priorValue,
          currentValue,
          priorValueFormatted: formatCurrency(priorValue),
          currentValueFormatted: formatCurrency(currentValue),
          absoluteChange,
          absoluteChangeFormatted: formatCurrency(absoluteChange),
          growthRate: parseFloat(growthRate.toFixed(2)),
          growthFormatted: `${growthRate >= 0 ? '+' : ''}${growthRate.toFixed(1)}%`
        });
      }
    });
  }

  // Sort by growth rate (highest first)
  growthRates.sort((a, b) => Math.abs(b.growthRate) - Math.abs(a.growthRate));

  return {
    rates: growthRates,
    summary: {
      totalComparisons: growthRates.length,
      averageGrowthRate: growthRates.length > 0
        ? (growthRates.reduce((sum, r) => sum + r.growthRate, 0) / growthRates.length).toFixed(2) + '%'
        : 'N/A',
      highestGrowth: growthRates[0] || null,
      lowestGrowth: growthRates[growthRates.length - 1] || null
    }
  };
}

/**
 * Analyze geographic and segment mix by period
 */
function analyzeMix(timeSeries, options) {
  const periods = [...new Set(timeSeries.map(t => t.period))].sort();

  const mixByPeriod = {};

  periods.forEach(period => {
    const periodData = timeSeries.filter(t => t.period === period);
    const total = periodData.reduce((sum, d) => sum + d.value, 0);

    const periodMix = {
      total,
      totalFormatted: formatCurrency(total)
    };

    // Geographic mix
    if (options.includeGeography) {
      const geographicMix = {};
      const geographies = [...new Set(periodData.map(d => d.geography))];

      geographies.forEach(geo => {
        const geoValue = periodData
          .filter(d => d.geography === geo)
          .reduce((sum, d) => sum + d.value, 0);

        geographicMix[geo] = {
          value: geoValue,
          valueFormatted: formatCurrency(geoValue),
          percentage: total > 0 ? (geoValue / total) * 100 : 0,
          percentageFormatted: total > 0 ? `${((geoValue / total) * 100).toFixed(1)}%` : 'N/A'
        };
      });

      periodMix.geographic = geographicMix;
    }

    // Segment mix
    if (options.includeSegments) {
      const segmentMix = {};
      const segments = [...new Set(periodData.map(d => d.segment))];

      segments.forEach(seg => {
        const segValue = periodData
          .filter(d => d.segment === seg)
          .reduce((sum, d) => sum + d.value, 0);

        segmentMix[seg] = {
          value: segValue,
          valueFormatted: formatCurrency(segValue),
          percentage: total > 0 ? (segValue / total) * 100 : 0,
          percentageFormatted: total > 0 ? `${((segValue / total) * 100).toFixed(1)}%` : 'N/A'
        };
      });

      periodMix.segment = segmentMix;
    }

    mixByPeriod[period] = periodMix;
  });

  return mixByPeriod;
}

/**
 * Calculate overall trends
 */
function calculateTrends(timeSeries) {
  const periods = [...new Set(timeSeries.map(t => t.period))].sort();

  if (periods.length < 2) {
    return {
      direction: 'insufficient_data',
      message: 'Need at least 2 periods to calculate trends'
    };
  }

  // Calculate total value per period
  const periodTotals = periods.map(period => {
    const periodData = timeSeries.filter(t => t.period === period);
    return {
      period,
      total: periodData.reduce((sum, d) => sum + d.value, 0)
    };
  });

  // Determine trend direction
  const firstTotal = periodTotals[periodTotals.length - 1].total;
  const lastTotal = periodTotals[0].total;
  const overallChange = lastTotal - firstTotal;
  const overallChangePercent = firstTotal > 0 ? ((overallChange / firstTotal) * 100) : 0;

  let direction = 'stable';
  if (overallChangePercent > 5) {
    direction = 'increasing';
  } else if (overallChangePercent < -5) {
    direction = 'decreasing';
  }

  return {
    direction,
    overallChange,
    overallChangeFormatted: formatCurrency(overallChange),
    overallChangePercent: overallChangePercent.toFixed(2) + '%',
    periodTotals,
    firstPeriod: {
      period: firstTotal.period || periods[periods.length - 1],
      value: firstTotal,
      valueFormatted: formatCurrency(firstTotal)
    },
    lastPeriod: {
      period: lastTotal.period || periods[0],
      value: lastTotal,
      valueFormatted: formatCurrency(lastTotal)
    }
  };
}

module.exports = {
  timeSeriesAnalysis,
  buildTimeSeriesTable,
  calculateGrowthRates,
  analyzeMix,
  calculateTrends
};
