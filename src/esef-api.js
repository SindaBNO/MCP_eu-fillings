const axios = require('axios');

const ESEF_API_BASE = 'https://filings.xbrl.org/api';
const GLEIF_API_BASE = 'https://api.gleif.org/api/v1';

/**
 * Make HTTP request to filings.xbrl.org API with proper error handling
 * @param {string} url - API URL to request
 * @returns {Promise<Object>} Response data
 */
async function makeESEFRequest(url) {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'Accept': 'application/vnd.api+json',
        'User-Agent': 'EU-Filings-MCP-Server/0.0.1'
      }
    });

    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error('Resource not found in ESEF database');
    }
    if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    throw new Error(`ESEF API request failed: ${error.message}`);
  }
}

/**
 * Search for companies by name using GLEIF database
 * Searches across 1.6M+ European companies with LEIs
 * @param {string} query - Company name to search for
 * @param {Object} options - Search options
 * @param {string} [options.country] - Filter by country code (FR, DE, IT, ES, NL, etc.)
 * @param {number} [options.limit] - Maximum number of results (default: 20)
 * @returns {Promise<Object>} Search results with company entities
 */
async function searchCompanies(query, options = {}) {
  const { country, limit = 20 } = options;

  try {
    // Build GLEIF API URL with name filter
    let url = `${GLEIF_API_BASE}/lei-records?filter[entity.legalName]=${encodeURIComponent(query)}&page[size]=${limit}`;

    // Add country filter if specified
    if (country) {
      url += `&filter[entity.legalAddress.country]=${country.toUpperCase()}`;
    }

    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'Accept': 'application/vnd.api+json',
        'User-Agent': 'EU-Filings-MCP-Server/0.0.1'
      }
    });

    const companies = [];

    if (response.data?.data && Array.isArray(response.data.data)) {
      for (const record of response.data.data) {
        const attrs = record.attributes || {};
        const entity = attrs.entity || {};
        const legalAddress = entity.legalAddress || {};

        companies.push({
          lei: attrs.lei,
          name: entity.legalName?.name || '',
          country: legalAddress.country || '',
          city: legalAddress.city || '',
          postal_code: legalAddress.postalCode || '',
          legal_form: entity.legalForm?.id || '',
          status: entity.status || '',
          registered_as: entity.registeredAs || '',
          source: 'GLEIF'
        });
      }
    }

    const totalInGleif = response.data?.meta?.pagination?.total || companies.length;

    return {
      query,
      companies,
      total_found: companies.length,
      total_available: totalInGleif,
      country_filter: country || 'all',
      source: 'GLEIF (Global LEI Foundation)',
      note: totalInGleif > limit
        ? `Showing ${companies.length} of ${totalInGleif} matches. Use LEI for detailed company info.`
        : null
    };

  } catch (error) {
    if (error.response?.status === 400) {
      throw new Error(`Invalid search query: ${query}`);
    }
    throw new Error(`Company search failed: ${error.message}`);
  }
}

/**
 * Get company information by LEI (Legal Entity Identifier)
 * Uses GLEIF as primary source, checks ESEF for filings availability
 * @param {string} lei - Legal Entity Identifier
 * @returns {Promise<Object>} Company information
 */
async function getCompanyByLEI(lei) {
  try {
    // Primary: Get company info from GLEIF
    const gleifUrl = `${GLEIF_API_BASE}/lei-records/${lei}`;
    const gleifResponse = await axios.get(gleifUrl, {
      timeout: 10000,
      headers: {
        'Accept': 'application/vnd.api+json',
        'User-Agent': 'EU-Filings-MCP-Server/0.0.1'
      }
    });

    if (!gleifResponse.data?.data?.attributes) {
      throw new Error(`LEI not found: ${lei}`);
    }

    const attrs = gleifResponse.data.data.attributes;
    const entity = attrs.entity || {};
    const legalAddress = entity.legalAddress || {};

    const companyInfo = {
      lei: lei,
      name: entity.legalName?.name || '',
      country: legalAddress.country || '',
      city: legalAddress.city || '',
      postal_code: legalAddress.postalCode || '',
      address: [
        legalAddress.addressLines?.join(', '),
        legalAddress.postalCode,
        legalAddress.city,
        legalAddress.country
      ].filter(Boolean).join(', '),
      legal_form: entity.legalForm?.id || '',
      status: entity.status || '',
      registered_as: entity.registeredAs || '',
      registration_date: attrs.registration?.initialRegistrationDate || '',
      last_update: attrs.registration?.lastUpdateDate || '',
      source: 'GLEIF'
    };

    // Secondary: Check if company has ESEF filings
    try {
      const esefUrl = `${ESEF_API_BASE}/entities?filter[identifier]=${lei}`;
      const esefData = await makeESEFRequest(esefUrl);

      if (esefData.data && esefData.data.length > 0) {
        companyInfo.entity_id = esefData.data[0].id;
        companyInfo.has_esef_filings = true;
      } else {
        companyInfo.has_esef_filings = false;
      }
    } catch (esefError) {
      companyInfo.has_esef_filings = false;
    }

    return companyInfo;

  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`LEI not found in GLEIF database: ${lei}`);
    }
    throw new Error(`Failed to lookup LEI: ${error.message}`);
  }
}

/**
 * Get company filings from ESEF database
 * @param {string} leiOrEntityId - LEI or entity ID from filings.xbrl.org
 * @param {Object} options - Filter options
 * @param {string} [options.startDate] - Start date (YYYY-MM-DD)
 * @param {string} [options.endDate] - End date (YYYY-MM-DD)
 * @param {string} [options.country] - Country code filter
 * @param {number} [options.limit] - Maximum results (default: 100)
 * @returns {Promise<Object>} Company filings
 */
async function getCompanyFilings(leiOrEntityId, options = {}) {
  const { startDate, endDate, country, limit = 100 } = options;

  // First, try to get entity by LEI if it looks like an LEI (20 characters alphanumeric)
  let entityId = leiOrEntityId;
  let companyInfo = null;

  if (leiOrEntityId.length === 20 && /^[A-Z0-9]+$/.test(leiOrEntityId)) {
    // This looks like an LEI
    try {
      companyInfo = await getCompanyByLEI(leiOrEntityId);
      entityId = companyInfo.entity_id || leiOrEntityId;
    } catch (error) {
      // If LEI lookup fails, try using it directly as entity ID
    }
  }

  // Build filings query URL
  let url = `${ESEF_API_BASE}/filings?page[size]=${limit}&sort=-processed`;

  // Filter by entity ID if we have it
  if (entityId) {
    url += `&filter[entity.id]=${entityId}`;
  }

  if (country) {
    url += `&filter[country]=${country.toUpperCase()}`;
  }

  if (startDate) {
    url += `&filter[period_end][gte]=${startDate}`;
  }

  if (endDate) {
    url += `&filter[period_end][lte]=${endDate}`;
  }

  const data = await makeESEFRequest(url);

  // Parse filings
  const filings = [];

  if (data.data && Array.isArray(data.data)) {
    for (const filing of data.data) {
      const attrs = filing.attributes || {};

      // Extract entity ID from relationship link
      const entityLink = filing.relationships?.entity?.links?.related;
      const filingEntityId = entityLink ? entityLink.split('/').pop() : '';

      filings.push({
        filing_id: filing.id,
        entity_id: filingEntityId || '',
        country: attrs.country || '',
        period_end: attrs.period_end || '',
        processed: attrs.processed || '',
        added: attrs.added || '',
        error_count: attrs.error_count || 0,
        warning_count: attrs.warning_count || 0,
        inconsistency_count: attrs.inconsistency_count || 0,
        package_url: attrs.package_url || '',
        json_url: attrs.json_url || '',
        xhtml_url: attrs.xhtml_url || '',
        viewer_url: attrs.viewer_url || '',
        fxo_id: attrs.fxo_id || '',
        sha256: attrs.sha256 || ''
      });
    }
  }

  return {
    lei: companyInfo?.lei || leiOrEntityId,
    entity_id: entityId,
    company_name: companyInfo?.name || 'Unknown',
    filings: filings,
    total_filings: filings.length,
    filters: {
      start_date: startDate,
      end_date: endDate,
      country: country
    },
    source: 'ESEF filings.xbrl.org'
  };
}

/**
 * Get all companies from a specific country
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code (FR, DE, IT, etc.)
 * @param {Object} options - Options
 * @param {number} [options.limit] - Maximum results (default: 100)
 * @returns {Promise<Object>} Companies from the country
 */
async function getCountryCompanies(countryCode, options = {}) {
  const { limit = 100 } = options;

  // Get recent filings from the country
  const url = `${ESEF_API_BASE}/filings?filter[country]=${countryCode.toUpperCase()}&page[size]=${limit}&sort=-processed`;

  const data = await makeESEFRequest(url);

  // Extract unique entities
  const entities = new Map();

  if (data.data && Array.isArray(data.data)) {
    for (const filing of data.data) {
      // Entity is in relationships.entity.links.related
      const entityLink = filing.relationships?.entity?.links?.related;
      if (!entityLink) continue;

      // Extract entity ID from the link (format: /api/entities/123456)
      const entityId = entityLink.split('/').pop();

      const attrs = filing.attributes || {};

      if (!entities.has(entityId)) {
        entities.set(entityId, {
          entity_id: entityId,
          country: attrs.country,
          latest_filing: {
            filing_id: filing.id,
            period_end: attrs.period_end,
            processed: attrs.processed
          }
        });
      }
    }
  }

  return {
    country: countryCode.toUpperCase(),
    companies: Array.from(entities.values()),
    total_found: entities.size,
    source: 'ESEF filings.xbrl.org',
    note: 'Companies are identified by entity_id. Use get_entity_details for more information.'
  };
}

/**
 * Get detailed entity information
 * @param {string} entityId - Entity ID from filings.xbrl.org
 * @returns {Promise<Object>} Entity details
 */
async function getEntityDetails(entityId) {
  const url = `${ESEF_API_BASE}/entities/${entityId}`;

  const data = await makeESEFRequest(url);

  if (!data.data) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  const attrs = data.data.attributes || {};

  return {
    entity_id: entityId,
    lei: attrs.identifier || '',
    name: attrs.name || '',
    api_id: attrs.api_id || '',
    source: 'ESEF filings.xbrl.org'
  };
}

/**
 * Get XBRL facts from a filing
 * @param {string} filingId - Filing ID from filings.xbrl.org
 * @returns {Promise<Object>} XBRL facts data
 */
async function getFilingFacts(filingId) {
  // Get filing details first
  const filingUrl = `${ESEF_API_BASE}/filings/${filingId}`;
  const filingData = await makeESEFRequest(filingUrl);

  if (!filingData.data) {
    throw new Error(`Filing not found: ${filingId}`);
  }

  const attrs = filingData.data.attributes || {};

  const FILINGS_BASE = 'https://filings.xbrl.org';

  // Download JSON representation if available
  if (attrs.json_url) {
    try {
      const fullJsonUrl = attrs.json_url.startsWith('http') ? attrs.json_url : FILINGS_BASE + attrs.json_url;
      const jsonResponse = await axios.get(fullJsonUrl, {
        timeout: 60000,
        headers: {
          'Accept': 'application/json'
        }
      });

      return {
        filing_id: filingId,
        period_end: attrs.period_end,
        country: attrs.country,
        json_url: fullJsonUrl,
        facts: jsonResponse.data,
        format: 'xbrl-json',
        source: 'ESEF filings.xbrl.org'
      };
    } catch (error) {
      throw new Error(`Failed to download filing JSON: ${error.message}`);
    }
  }

  // Fallback to package download and parsing
  if (attrs.package_url) {
    return {
      filing_id: filingId,
      period_end: attrs.period_end,
      country: attrs.country,
      package_url: FILINGS_BASE + attrs.package_url,
      xhtml_url: attrs.xhtml_url ? FILINGS_BASE + attrs.xhtml_url : null,
      viewer_url: attrs.viewer_url ? FILINGS_BASE + attrs.viewer_url : null,
      note: 'JSON facts not available. Use package_url or viewer_url for detailed data.',
      source: 'ESEF filings.xbrl.org'
    };
  }

  throw new Error('No downloadable data available for this filing');
}

/**
 * Get validation messages for a filing
 * @param {string} filingId - Filing ID
 * @returns {Promise<Object>} Validation messages
 */
async function getFilingValidation(filingId) {
  const url = `${ESEF_API_BASE}/filings/${filingId}?include=validation_messages`;

  const data = await makeESEFRequest(url);

  if (!data.data) {
    throw new Error(`Filing not found: ${filingId}`);
  }

  const attrs = data.data.attributes || {};
  const included = data.included || [];

  // Extract validation messages from included resources
  const validationMessages = included
    .filter(item => item.type === 'validation_message')
    .map(msg => ({
      id: msg.id,
      severity: msg.attributes?.severity || '',
      code: msg.attributes?.code || '',
      text: msg.attributes?.text || ''
    }));

  return {
    filing_id: filingId,
    period_end: attrs.period_end,
    country: attrs.country,
    error_count: attrs.error_count || 0,
    warning_count: attrs.warning_count || 0,
    inconsistency_count: attrs.inconsistency_count || 0,
    validation_messages: validationMessages,
    total_messages: validationMessages.length,
    source: 'ESEF filings.xbrl.org'
  };
}

/**
 * Filter filings by criteria
 * @param {Array} filings - Array of filing objects
 * @param {Object} filters - Filter criteria
 * @param {string} [filters.startDate] - Start date (YYYY-MM-DD)
 * @param {string} [filters.endDate] - End date (YYYY-MM-DD)
 * @param {string} [filters.country] - Country code
 * @param {number} [filters.maxErrors] - Maximum error count
 * @param {number} [filters.limit] - Maximum number of results
 * @returns {Array} Filtered filings
 */
function filterFilings(filings, filters = {}) {
  let filtered = [...filings];

  if (filters.startDate) {
    filtered = filtered.filter(filing =>
      filing.period_end && filing.period_end >= filters.startDate
    );
  }

  if (filters.endDate) {
    filtered = filtered.filter(filing =>
      filing.period_end && filing.period_end <= filters.endDate
    );
  }

  if (filters.country) {
    filtered = filtered.filter(filing =>
      filing.country && filing.country.toUpperCase() === filters.country.toUpperCase()
    );
  }

  if (filters.maxErrors !== undefined) {
    filtered = filtered.filter(filing =>
      (filing.error_count || 0) <= filters.maxErrors
    );
  }

  if (filters.limit && filters.limit > 0) {
    filtered = filtered.slice(0, filters.limit);
  }

  return filtered;
}

/**
 * Get dimensional facts from a specific filing with search criteria
 * @param {string} leiOrEntityId - LEI or entity ID
 * @param {string} filingId - Filing ID
 * @param {Object} searchCriteria - Search criteria for facts
 * @returns {Promise<Object>} Dimensional facts matching criteria
 */
async function getDimensionalFacts(leiOrEntityId, filingId, searchCriteria) {
  const axios = require('axios');
  const { downloadAndParseXBRL, findDimensionalFacts } = require('./xbrl-parser.js');

  try {
    // Get filing details
    const filingUrl = `${ESEF_API_BASE}/filings/${filingId}`;
    const filingResponse = await axios.get(filingUrl, {
      headers: { 'Accept': 'application/vnd.api+json' }
    });

    const filingAttrs = filingResponse.data.data.attributes;

    if (!filingAttrs.json_url) {
      throw new Error('No XBRL JSON data available for this filing');
    }

    // Download and parse XBRL
    const jsonUrl = `https://filings.xbrl.org${filingAttrs.json_url}`;
    const xbrlData = await downloadAndParseXBRL(jsonUrl, 'json');

    // Find matching facts
    const matchingFacts = findDimensionalFacts(xbrlData, searchCriteria);

    return {
      company: leiOrEntityId,
      filing_id: filingId,
      filing_period: filingAttrs.period_end,
      filing_country: filingAttrs.country,
      criteria: searchCriteria,
      facts: matchingFacts,
      totalFacts: matchingFacts.length,
      totalContexts: Object.keys(xbrlData.contexts).length,
      source: 'ESEF XBRL Dimensional Analysis'
    };

  } catch (error) {
    throw new Error(`Failed to get dimensional facts: ${error.message}`);
  }
}

/**
 * Search for facts by value range across multiple filings
 * @param {string} lei - Company LEI
 * @param {number} targetValue - Target value
 * @param {number} tolerance - Tolerance range (±)
 * @param {Object} filters - Additional filters
 * @returns {Promise<Object>} Matching facts across filings
 */
async function searchFactsByValue(lei, targetValue, tolerance = 50000000, filters = {}) {
  const axios = require('axios');
  const { downloadAndParseXBRL, findDimensionalFacts } = require('./xbrl-parser.js');

  try {
    const maxFilings = filters.maxFilings || 5;

    // Get recent filings
    const filings = await getCompanyFilings(lei, { limit: maxFilings });

    if (!filings.filings || filings.filings.length === 0) {
      throw new Error('No filings found for company');
    }

    const allMatches = [];
    let filingsSearched = 0;

    for (const filing of filings.filings) {
      try {
        // Get filing details
        const filingUrl = `${ESEF_API_BASE}/filings/${filing.filing_id}`;
        const filingResponse = await axios.get(filingUrl, {
          headers: { 'Accept': 'application/vnd.api+json' }
        });

        const filingAttrs = filingResponse.data.data.attributes;

        if (!filingAttrs.json_url) {
          continue;
        }

        // Download and parse XBRL
        const jsonUrl = `https://filings.xbrl.org${filingAttrs.json_url}`;
        const xbrlData = await downloadAndParseXBRL(jsonUrl, 'json');

        // Build search criteria
        const searchCriteria = {
          valueRange: {
            min: targetValue - tolerance,
            max: targetValue + tolerance
          },
          concept: filters.concept,
          dimensions: filters.dimensions
        };

        const facts = findDimensionalFacts(xbrlData, searchCriteria);

        // Add filing context to each fact
        facts.forEach(fact => {
          allMatches.push({
            ...fact,
            filing_id: filing.filing_id,
            filing_period: filing.period_end,
            filing_country: filing.country,
            processed_date: filing.processed
          });
        });

        filingsSearched++;

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        // Skip failed filings
        continue;
      }
    }

    // Sort by deviation from target
    allMatches.sort((a, b) => {
      const devA = Math.abs(a.value - targetValue);
      const devB = Math.abs(b.value - targetValue);
      return devA - devB;
    });

    return {
      company: lei,
      targetValue,
      tolerance,
      searchRange: {
        min: targetValue - tolerance,
        max: targetValue + tolerance
      },
      filters,
      matches: allMatches,
      totalMatches: allMatches.length,
      filingsSearched,
      closestMatch: allMatches[0] || null,
      source: 'ESEF Cross-Filing Value Search'
    };

  } catch (error) {
    throw new Error(`Value search failed: ${error.message}`);
  }
}

module.exports = {
  searchCompanies,
  getCompanyByLEI,
  getCompanyFilings,
  getCountryCompanies,
  getEntityDetails,
  getFilingFacts,
  getFilingValidation,
  filterFilings,
  getDimensionalFacts,
  searchFactsByValue
};
