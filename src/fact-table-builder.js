const { downloadAndParseXBRL, findDimensionalFacts, classifyIFRSFact } = require('./xbrl-parser.js');
const { getCompanyFilings } = require('./esef-api.js');

/**
 * Build comprehensive fact table around target value
 * Adapted from SEC server for IFRS/ESEF filings
 *
 * @param {string} lei - Company LEI or entity ID
 * @param {number} targetValue - Target value in currency units
 * @param {number} tolerance - Tolerance range (±)
 * @param {string} filingId - Optional specific filing ID
 * @param {Object} options - Table options
 * @returns {Promise<Object>} Fact table with business intelligence
 */
async function buildFactTable(lei, targetValue, tolerance = 50000000, filingId = null, options = {}) {
  const defaultOptions = {
    maxRows: 25,
    showDimensions: true,
    sortBy: 'deviation', // 'deviation', 'value', 'concept'
    filters: {}
  };

  const tableOptions = { ...defaultOptions, ...options };

  try {
    // 1. Get target filing
    let targetFilingId = filingId;
    let filingInfo = null;

    if (!targetFilingId) {
      const filings = await getCompanyFilings(lei, { limit: 1 });
      if (!filings.filings || filings.filings.length === 0) {
        throw new Error('No filings found for company');
      }
      filingInfo = filings.filings[0];
      targetFilingId = filingInfo.filing_id;
    }

    // 2. Get filing details to access XBRL data
    const axios = require('axios');
    const filingUrl = `https://filings.xbrl.org/api/filings/${targetFilingId}`;
    const filingResponse = await axios.get(filingUrl, {
      headers: { 'Accept': 'application/vnd.api+json' }
    });

    const filingAttrs = filingResponse.data.data.attributes;

    if (!filingAttrs.json_url) {
      return {
        company: lei,
        filing_id: targetFilingId,
        error: 'No XBRL JSON data available for this filing',
        note: 'Try xhtml_url or package_url for manual extraction',
        xhtml_url: filingAttrs.xhtml_url,
        package_url: filingAttrs.package_url
      };
    }

    // 3. Download and parse XBRL
    const jsonUrl = `https://filings.xbrl.org${filingAttrs.json_url}`;
    const xbrlData = await downloadAndParseXBRL(jsonUrl, 'json');

    // 4. Find facts in value range
    const searchCriteria = {
      valueRange: {
        min: targetValue - tolerance,
        max: targetValue + tolerance
      },
      ...tableOptions.filters
    };

    const matchingFacts = findDimensionalFacts(xbrlData, searchCriteria);

    if (matchingFacts.length === 0) {
      return {
        company: lei,
        filing_id: targetFilingId,
        filing_period: filingAttrs.period_end,
        targetValue,
        tolerance,
        searchRange: {
          min: targetValue - tolerance,
          max: targetValue + tolerance,
          minFormatted: formatCurrency(targetValue - tolerance),
          maxFormatted: formatCurrency(targetValue + tolerance)
        },
        table: [],
        summary: {
          totalFacts: 0,
          message: 'No facts found in the specified value range'
        }
      };
    }

    // 5. Enrich facts with business intelligence
    const enrichedFacts = matchingFacts.map((fact, index) => {
      const deviation = fact.value - targetValue;
      const exactMatch = Math.abs(deviation) < 1000;

      return {
        rowNumber: index + 1,
        concept: fact.concept,
        namespace: fact.namespace || 'unknown',
        value: fact.value,
        valueFormatted: formatCurrency(fact.value),
        exactMatch,
        deviationFromTarget: deviation,
        deviationFormatted: `${deviation >= 0 ? '+' : ''}${formatCurrency(deviation)}`,
        deviationPercent: targetValue !== 0 ? ((deviation / targetValue) * 100).toFixed(2) + '%' : 'N/A',

        periodType: fact.periodType || 'unknown',
        periodStart: fact.periodStart,
        periodEnd: fact.periodEnd,

        dimensions: fact.dimensions || {},
        dimensionCount: Object.keys(fact.dimensions || {}).length,

        geography: extractGeographyFromDimensions(fact.dimensions),
        segment: extractSegmentFromDimensions(fact.dimensions),
        product: extractProductFromDimensions(fact.dimensions),

        hasGeographicDimension: hasGeographyDimension(fact.dimensions),
        hasSegmentDimension: hasSegmentDimension(fact.dimensions),
        hasProductDimension: hasProductDimension(fact.dimensions),

        businessClassification: classifyIFRSFact(fact),

        contextRef: fact.contextRef,
        unitRef: fact.unitRef,
        decimals: fact.decimals,
        scale: fact.scale
      };
    });

    // 6. Sort based on options
    sortFacts(enrichedFacts, tableOptions.sortBy);

    // 7. Limit results
    const limitedFacts = enrichedFacts.slice(0, tableOptions.maxRows);

    // 8. Generate business intelligence summary
    const summary = generateFactTableSummary(enrichedFacts, targetValue, tolerance);

    return {
      company: lei,
      filing_id: targetFilingId,
      filing_period: filingAttrs.period_end,
      filing_country: filingAttrs.country,
      targetValue,
      tolerance,
      searchRange: {
        min: targetValue - tolerance,
        max: targetValue + tolerance,
        minFormatted: formatCurrency(targetValue - tolerance),
        maxFormatted: formatCurrency(targetValue + tolerance)
      },
      table: limitedFacts,
      summary,
      totalFactsFound: enrichedFacts.length,
      totalFactsReturned: limitedFacts.length,
      source: 'ESEF XBRL Dimensional Analysis',
      xbrl_source: jsonUrl
    };

  } catch (error) {
    throw new Error(`Failed to build fact table: ${error.message}`);
  }
}

/**
 * Generate comprehensive summary statistics
 */
function generateFactTableSummary(facts, targetValue, tolerance) {
  if (!facts || facts.length === 0) {
    return {
      totalFacts: 0,
      exactMatches: 0,
      message: 'No facts found'
    };
  }

  const values = facts.map(f => f.value);

  return {
    totalFacts: facts.length,
    exactMatches: facts.filter(f => f.exactMatch).length,

    conceptTypes: [...new Set(facts.map(f => f.concept))],
    uniqueConcepts: [...new Set(facts.map(f => f.concept))].length,

    factsWithGeography: facts.filter(f => f.hasGeographicDimension).length,
    factsWithSegments: facts.filter(f => f.hasSegmentDimension).length,
    factsWithProducts: facts.filter(f => f.hasProductDimension).length,
    factsWithDimensions: facts.filter(f => f.dimensionCount > 0).length,

    valueRange: {
      min: Math.min(...values),
      max: Math.max(...values),
      minFormatted: formatCurrency(Math.min(...values)),
      maxFormatted: formatCurrency(Math.max(...values)),
      average: values.reduce((a, b) => a + b, 0) / values.length,
      averageFormatted: formatCurrency(values.reduce((a, b) => a + b, 0) / values.length)
    },

    businessTypes: facts.reduce((acc, fact) => {
      const type = fact.businessClassification;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {}),

    periodTypes: [...new Set(facts.map(f => f.periodType))],

    geographicBreakdown: getGeographicBreakdown(facts),
    segmentBreakdown: getSegmentBreakdown(facts),

    closestMatch: facts.reduce((closest, fact) => {
      return Math.abs(fact.deviationFromTarget) < Math.abs(closest.deviationFromTarget)
        ? fact
        : closest;
    }, facts[0])
  };
}

/**
 * Get geographic breakdown summary
 */
function getGeographicBreakdown(facts) {
  const breakdown = {};

  facts.forEach(fact => {
    if (fact.geography) {
      if (!breakdown[fact.geography]) {
        breakdown[fact.geography] = {
          count: 0,
          totalValue: 0,
          avgValue: 0
        };
      }
      breakdown[fact.geography].count++;
      breakdown[fact.geography].totalValue += fact.value;
    }
  });

  // Calculate averages
  Object.keys(breakdown).forEach(geo => {
    breakdown[geo].avgValue = breakdown[geo].totalValue / breakdown[geo].count;
    breakdown[geo].totalValueFormatted = formatCurrency(breakdown[geo].totalValue);
    breakdown[geo].avgValueFormatted = formatCurrency(breakdown[geo].avgValue);
  });

  return breakdown;
}

/**
 * Get segment breakdown summary
 */
function getSegmentBreakdown(facts) {
  const breakdown = {};

  facts.forEach(fact => {
    if (fact.segment) {
      if (!breakdown[fact.segment]) {
        breakdown[fact.segment] = {
          count: 0,
          totalValue: 0,
          avgValue: 0
        };
      }
      breakdown[fact.segment].count++;
      breakdown[fact.segment].totalValue += fact.value;
    }
  });

  // Calculate averages
  Object.keys(breakdown).forEach(seg => {
    breakdown[seg].avgValue = breakdown[seg].totalValue / breakdown[seg].count;
    breakdown[seg].totalValueFormatted = formatCurrency(breakdown[seg].totalValue);
    breakdown[seg].avgValueFormatted = formatCurrency(breakdown[seg].avgValue);
  });

  return breakdown;
}

/**
 * Sort facts based on criteria
 */
function sortFacts(facts, sortBy) {
  if (sortBy === 'deviation') {
    facts.sort((a, b) => Math.abs(a.deviationFromTarget) - Math.abs(b.deviationFromTarget));
  } else if (sortBy === 'value') {
    facts.sort((a, b) => b.value - a.value);
  } else if (sortBy === 'concept') {
    facts.sort((a, b) => a.concept.localeCompare(b.concept));
  }
}

/**
 * Format currency value with appropriate unit
 */
function formatCurrency(value) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1000000000) {
    return `${sign}€${(absValue / 1000000000).toFixed(2)}B`;
  } else if (absValue >= 1000000) {
    return `${sign}€${(absValue / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${sign}€${(absValue / 1000).toFixed(1)}K`;
  } else {
    return `${sign}€${absValue.toFixed(0)}`;
  }
}

/**
 * Extract geography from dimensions
 */
function extractGeographyFromDimensions(dimensions) {
  if (!dimensions) return null;

  const geoKeys = [
    'ifrs-full:GeographicalAreasMember',
    'GeographicalAreasMember',
    'CountriesMember',
    'RegionsMember',
    'StatementGeographicalAxis'
  ];

  for (const key of Object.keys(dimensions)) {
    if (geoKeys.some(geoKey => key.includes(geoKey))) {
      return cleanDimensionValue(dimensions[key]);
    }
  }

  return null;
}

/**
 * Extract segment from dimensions
 */
function extractSegmentFromDimensions(dimensions) {
  if (!dimensions) return null;

  const segmentKeys = [
    'ifrs-full:SegmentsMember',
    'SegmentsMember',
    'BusinessSegmentsMember',
    'OperatingSegmentsMember',
    'StatementBusinessSegmentsAxis'
  ];

  for (const key of Object.keys(dimensions)) {
    if (segmentKeys.some(segKey => key.includes(segKey))) {
      return cleanDimensionValue(dimensions[key]);
    }
  }

  return null;
}

/**
 * Extract product from dimensions
 */
function extractProductFromDimensions(dimensions) {
  if (!dimensions) return null;

  const productKeys = [
    'ProductsAndServicesMember',
    'ProductMember',
    'SubsegmentsAxis'
  ];

  for (const key of Object.keys(dimensions)) {
    if (productKeys.some(prodKey => key.includes(prodKey))) {
      return cleanDimensionValue(dimensions[key]);
    }
  }

  return null;
}

/**
 * Check if dimensions include geography
 */
function hasGeographyDimension(dimensions) {
  return extractGeographyFromDimensions(dimensions) !== null;
}

/**
 * Check if dimensions include segment
 */
function hasSegmentDimension(dimensions) {
  return extractSegmentFromDimensions(dimensions) !== null;
}

/**
 * Check if dimensions include product
 */
function hasProductDimension(dimensions) {
  return extractProductFromDimensions(dimensions) !== null;
}

/**
 * Clean dimension value (remove namespace and 'Member' suffix)
 */
function cleanDimensionValue(value) {
  if (!value || typeof value !== 'string') return value;

  return value
    .split(':').pop() // Remove namespace
    .replace(/Member$/, '') // Remove 'Member' suffix
    .replace(/([A-Z])/g, ' $1') // Add spaces before capitals
    .trim();
}

module.exports = {
  buildFactTable,
  generateFactTableSummary,
  sortFacts,
  formatCurrency,
  extractGeographyFromDimensions,
  extractSegmentFromDimensions,
  extractProductFromDimensions
};
