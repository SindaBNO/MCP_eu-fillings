const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Parse XBRL JSON format from filings.xbrl.org
 * @param {Object} jsonData - XBRL JSON data
 * @returns {Object} Parsed facts with structure
 */
function parseXBRLJSON(jsonData) {
  const facts = [];
  const contexts = {};
  const units = {};

  // Parse contexts
  if (jsonData.contexts) {
    for (const [contextId, contextData] of Object.entries(jsonData.contexts)) {
      contexts[contextId] = {
        id: contextId,
        period: contextData.period || {},
        entity: contextData.entity || {},
        dimensions: extractDimensionsFromContext(contextData)
      };
    }
  }

  // Parse units
  if (jsonData.units) {
    for (const [unitId, unitData] of Object.entries(jsonData.units)) {
      units[unitId] = {
        id: unitId,
        measures: unitData.measures || []
      };
    }
  }

  // Parse facts
  // Handle the actual filings.xbrl.org format where facts is an object with fact IDs as keys
  if (jsonData.facts && typeof jsonData.facts === 'object') {
    for (const [factId, fact] of Object.entries(jsonData.facts)) {
      // Each fact has dimensions object containing concept, period, entity, etc.
      if (!fact.dimensions || !fact.dimensions.concept) {
        continue; // Skip facts without concept
      }

      const conceptFull = fact.dimensions.concept; // e.g., "ifrs-full:Revenue"
      const [namespace, concept] = conceptFull.includes(':')
        ? conceptFull.split(':', 2)
        : ['unknown', conceptFull];

      // Parse period from dimension
      const period = fact.dimensions.period || '';
      const periodType = period.includes('/') ? 'duration' : 'instant';
      let periodStart = null;
      let periodEnd = null;

      if (periodType === 'duration' && period.includes('/')) {
        const [start, end] = period.split('/');
        periodStart = start;
        periodEnd = end;
      } else if (periodType === 'instant') {
        periodEnd = period;
      }

      // Extract explicit dimensions (excluding standard ones)
      const explicitDimensions = {};
      for (const [key, value] of Object.entries(fact.dimensions)) {
        if (!['concept', 'period', 'entity', 'language', 'unit'].includes(key)) {
          explicitDimensions[key] = value;
        }
      }

      const numericValue = parseFactValue(fact.value);

      // Only include facts with numeric values or specific dimensions
      if (numericValue !== null || Object.keys(explicitDimensions).length > 0) {
        facts.push({
          factId,
          namespace,
          concept,
          value: numericValue,
          valueRaw: fact.value,
          contextRef: factId, // Use fact ID as context reference
          unitRef: fact.dimensions.unit || null,
          decimals: fact.decimals,
          scale: fact.scale,
          periodType,
          periodStart,
          periodEnd,
          dimensions: explicitDimensions,
          dimensionCount: Object.keys(explicitDimensions).length
        });
      }
    }
  }

  return {
    facts,
    contexts,
    units,
    totalFacts: facts.length,
    totalContexts: Object.keys(contexts).length
  };
}

/**
 * Extract dimensions from XBRL context
 * @param {Object} contextData - Context data from XBRL JSON
 * @returns {Object} Dimensions object
 */
function extractDimensionsFromContext(contextData) {
  const dimensions = {};

  if (contextData.entity?.segment) {
    const segment = contextData.entity.segment;

    // Handle explicit dimensions
    if (segment.explicitMember) {
      for (const [dimension, member] of Object.entries(segment.explicitMember)) {
        dimensions[dimension] = member;
      }
    }

    // Handle typed dimensions
    if (segment.typedMember) {
      for (const [dimension, value] of Object.entries(segment.typedMember)) {
        dimensions[dimension] = value;
      }
    }
  }

  return dimensions;
}

/**
 * Parse fact value to numeric if possible
 * @param {*} value - Raw value
 * @returns {*} Parsed value
 */
function parseFactValue(value) {
  if (typeof value === 'string') {
    const numeric = parseFloat(value);
    if (!isNaN(numeric)) {
      return numeric;
    }
  }
  return value;
}

/**
 * Find facts matching search criteria in parsed XBRL data
 * @param {Object} xbrlData - Parsed XBRL data
 * @param {Object} criteria - Search criteria
 * @param {string} [criteria.concept] - Concept name to match (partial match)
 * @param {number} [criteria.value] - Exact value to match
 * @param {Object} [criteria.valueRange] - Value range {min, max}
 * @param {Object} [criteria.dimensions] - Dimension filters
 * @returns {Array} Matching facts
 */
function findDimensionalFacts(xbrlData, criteria = {}) {
  const { concept, value, valueRange, dimensions } = criteria;

  let matchingFacts = [...xbrlData.facts];

  // Filter by concept
  if (concept) {
    const conceptLower = concept.toLowerCase();
    matchingFacts = matchingFacts.filter(fact =>
      fact.concept.toLowerCase().includes(conceptLower)
    );
  }

  // Filter by exact value
  if (value !== undefined) {
    matchingFacts = matchingFacts.filter(fact =>
      Math.abs(parseFactValue(fact.value) - value) < 1000
    );
  }

  // Filter by value range
  if (valueRange) {
    const { min, max } = valueRange;
    matchingFacts = matchingFacts.filter(fact => {
      const factValue = parseFactValue(fact.value);
      return typeof factValue === 'number' &&
             factValue >= min &&
             factValue <= max;
    });
  }

  // Filter by dimensions
  if (dimensions && Object.keys(dimensions).length > 0) {
    matchingFacts = matchingFacts.filter(fact => {
      if (!fact.dimensions) return false;

      for (const [dimKey, dimValue] of Object.entries(dimensions)) {
        const dimLower = dimValue.toLowerCase();

        // Check if any dimension matches
        const hasMatch = Object.entries(fact.dimensions).some(([factDimKey, factDimValue]) => {
          const factDimValueLower = String(factDimValue).toLowerCase();
          return factDimValueLower.includes(dimLower) ||
                 factDimKey.toLowerCase().includes(dimKey.toLowerCase());
        });

        if (!hasMatch) return false;
      }

      return true;
    });
  }

  return matchingFacts;
}

/**
 * Parse inline XBRL (iXBRL) from XHTML
 * @param {string} xhtml - XHTML content with inline XBRL
 * @returns {Object} Parsed XBRL data
 */
function parseInlineXBRL(xhtml) {
  const $ = cheerio.load(xhtml, { xmlMode: true });
  const facts = [];
  const contexts = {};
  const units = {};

  // Parse contexts
  $('xbrli\\:context, context').each((i, elem) => {
    const contextId = $(elem).attr('id');
    const period = {};
    const entity = {};
    const dimensions = {};

    // Parse period
    const instant = $(elem).find('xbrli\\:instant, instant').text();
    const startDate = $(elem).find('xbrli\\:startDate, startDate').text();
    const endDate = $(elem).find('xbrli\\:endDate, endDate').text();

    if (instant) {
      period.instant = instant;
    }
    if (startDate) {
      period.startDate = startDate;
    }
    if (endDate) {
      period.endDate = endDate;
    }

    // Parse entity identifier
    const identifier = $(elem).find('xbrli\\:identifier, identifier').text();
    if (identifier) {
      entity.identifier = identifier;
    }

    // Parse dimensions
    $(elem).find('xbrldi\\:explicitMember, explicitMember').each((j, dimElem) => {
      const dimension = $(dimElem).attr('dimension');
      const member = $(dimElem).text();
      if (dimension && member) {
        dimensions[dimension] = member;
      }
    });

    contexts[contextId] = {
      id: contextId,
      period,
      entity,
      dimensions
    };
  });

  // Parse units
  $('xbrli\\:unit, unit').each((i, elem) => {
    const unitId = $(elem).attr('id');
    const measures = [];

    $(elem).find('xbrli\\:measure, measure').each((j, measureElem) => {
      measures.push($(measureElem).text());
    });

    units[unitId] = {
      id: unitId,
      measures
    };
  });

  // Parse inline XBRL facts (ix:nonFraction, ix:fraction, ix:nonNumeric)
  $('ix\\:nonFraction, ix\\:fraction').each((i, elem) => {
    const $elem = $(elem);
    const name = $elem.attr('name');
    const contextRef = $elem.attr('contextRef');
    const unitRef = $elem.attr('unitRef');
    const decimals = $elem.attr('decimals');
    const scale = $elem.attr('scale');
    const format = $elem.attr('format');

    if (!name || !contextRef) return;

    // Extract namespace and concept
    const [namespace, concept] = name.includes(':') ? name.split(':') : ['unknown', name];

    // Get value
    let value = $elem.text().trim();

    // Apply scale if present
    let numericValue = parseFloat(value.replace(/[,\s]/g, ''));
    if (!isNaN(numericValue) && scale) {
      numericValue = numericValue * Math.pow(10, parseInt(scale));
    }

    const context = contexts[contextRef];

    facts.push({
      namespace,
      concept,
      value: isNaN(numericValue) ? value : numericValue,
      valueRaw: value,
      contextRef,
      unitRef,
      decimals,
      scale,
      format,
      periodType: context?.period?.instant ? 'instant' : 'duration',
      periodStart: context?.period?.startDate,
      periodEnd: context?.period?.endDate || context?.period?.instant,
      dimensions: context?.dimensions || {},
      dimensionCount: Object.keys(context?.dimensions || {}).length
    });
  });

  return {
    facts,
    contexts,
    units,
    totalFacts: facts.length,
    totalContexts: Object.keys(contexts).length
  };
}

/**
 * Download and parse XBRL filing
 * @param {string} url - URL to XBRL file (JSON or XHTML)
 * @param {string} format - Format type: 'json' or 'xhtml'
 * @returns {Promise<Object>} Parsed XBRL data
 */
async function downloadAndParseXBRL(url, format = 'json') {
  try {
    const response = await axios.get(url, {
      timeout: 60000,
      headers: {
        'Accept': format === 'json' ? 'application/json' : 'application/xhtml+xml',
        'User-Agent': 'EU-Filings-MCP-Server/0.0.1'
      }
    });

    if (format === 'json') {
      return parseXBRLJSON(response.data);
    } else {
      return parseInlineXBRL(response.data);
    }
  } catch (error) {
    throw new Error(`Failed to download and parse XBRL: ${error.message}`);
  }
}

/**
 * Classify fact based on IFRS taxonomy concept
 * @param {Object} fact - Fact object
 * @returns {string} Classification
 */
function classifyIFRSFact(fact) {
  if (!fact.concept) return 'Unknown';

  const concept = fact.concept.toLowerCase();
  const hasDimensions = fact.dimensions && Object.keys(fact.dimensions).length > 0;

  // Revenue classification
  if (concept.includes('revenue') || concept.includes('sales')) {
    if (hasDimensions) {
      if (fact.dimensions['ifrs-full:ProductsAndServicesMember'] ||
          fact.dimensions['ProductsAndServicesMember']) {
        return 'Product Revenue';
      }
      if (fact.dimensions['ifrs-full:GeographicalAreasMember'] ||
          fact.dimensions['GeographicalAreasMember']) {
        return 'Geographic Revenue';
      }
      if (fact.dimensions['ifrs-full:SegmentsMember'] ||
          fact.dimensions['SegmentsMember']) {
        return 'Segment Revenue';
      }
    }
    return 'Total Revenue';
  }

  // Asset classification
  if (concept.includes('asset')) {
    if (concept.includes('current')) return 'Current Assets';
    if (concept.includes('noncurrent') || concept.includes('non-current')) return 'Non-Current Assets';
    return 'Assets';
  }

  // Liability classification
  if (concept.includes('liability') || concept.includes('liabilities')) {
    if (concept.includes('current')) return 'Current Liabilities';
    if (concept.includes('noncurrent') || concept.includes('non-current')) return 'Non-Current Liabilities';
    return 'Liabilities';
  }

  // Income/profit classification
  if (concept.includes('profit') || concept.includes('income')) {
    if (concept.includes('operating')) return 'Operating Income';
    if (concept.includes('net')) return 'Net Income';
    return 'Income';
  }

  // Expense classification
  if (concept.includes('expense') || concept.includes('cost')) {
    return 'Expense';
  }

  // Equity classification
  if (concept.includes('equity')) {
    return 'Equity';
  }

  // Cash flow classification
  if (concept.includes('cash')) {
    return 'Cash Flow';
  }

  return 'Other Financial';
}

/**
 * Extract geographic dimension from fact
 * @param {Object} fact - Fact with dimensions
 * @returns {string|null} Geographic label
 */
function extractGeographicDimension(fact) {
  if (!fact.dimensions) return null;

  const geoDimensions = [
    'ifrs-full:GeographicalAreasMember',
    'GeographicalAreasMember',
    'CountriesMember',
    'RegionsMember'
  ];

  for (const dimKey of Object.keys(fact.dimensions)) {
    if (geoDimensions.some(geo => dimKey.includes(geo))) {
      const value = fact.dimensions[dimKey];
      return value.replace(/Member$/, '').split(':').pop();
    }
  }

  return null;
}

/**
 * Extract segment dimension from fact
 * @param {Object} fact - Fact with dimensions
 * @returns {string|null} Segment label
 */
function extractSegmentDimension(fact) {
  if (!fact.dimensions) return null;

  const segmentDimensions = [
    'ifrs-full:SegmentsMember',
    'SegmentsMember',
    'BusinessSegmentsMember',
    'OperatingSegmentsMember'
  ];

  for (const dimKey of Object.keys(fact.dimensions)) {
    if (segmentDimensions.some(seg => dimKey.includes(seg))) {
      const value = fact.dimensions[dimKey];
      return value.replace(/Member$/, '').split(':').pop();
    }
  }

  return null;
}

module.exports = {
  parseXBRLJSON,
  parseInlineXBRL,
  downloadAndParseXBRL,
  findDimensionalFacts,
  extractDimensionsFromContext,
  parseFactValue,
  classifyIFRSFact,
  extractGeographicDimension,
  extractSegmentDimension
};
