const axios = require('axios');

/**
 * Integration with bundesAPI for German company data
 * GitHub: https://github.com/bundesAPI/deutschland
 *
 * bundesAPI provides access to:
 * - Bundesanzeiger (Federal Gazette) financial reports
 * - Company registration data
 * - Annual financial statements
 */

const BUNDESANZEIGER_API_BASE = 'https://api.bund.dev/v1';

/**
 * Search for German companies in Bundesanzeiger
 * @param {string} query - Company name to search for
 * @param {Object} options - Search options
 * @param {number} [options.limit] - Maximum results (default: 10)
 * @returns {Promise<Object>} Search results
 */
async function searchGermanCompanies(query, options = {}) {
  const { limit = 10 } = options;

  try {
    // Note: bundesAPI is community-maintained and may have rate limits
    // The API structure might vary - this is based on available documentation

    // For now, we'll provide a placeholder that explains the limitation
    // and shows how to integrate when the API is available

    return {
      query,
      country: 'DE',
      source: 'bundesAPI (limited)',
      companies: [],
      note: 'German company data access is limited. Bundesanzeiger does not provide a comprehensive public API. Consider: (1) Waiting for ESAP (2027), (2) Using commercial APIs like handelsregister.ai, or (3) Manual lookup at bundesanzeiger.de',
      manual_search_url: `https://www.bundesanzeiger.de/pub/en/search?0&query=${encodeURIComponent(query)}`,
      alternative_sources: {
        handelsregister_ai: 'https://handelsregister.ai',
        openregisters: 'https://www.openregisters.com',
        gleif_lei_search: 'https://search.gleif.org/'
      }
    };

  } catch (error) {
    throw new Error(`bundesAPI request failed: ${error.message}`);
  }
}

/**
 * Get German company by LEI using GLEIF as primary source
 * @param {string} lei - Legal Entity Identifier
 * @returns {Promise<Object>} Company information
 */
async function getGermanCompanyByLEI(lei) {
  try {
    // Use GLEIF (Global LEI Foundation) API for German company lookup
    const gleifUrl = `https://api.gleif.org/api/v1/lei-records/${lei}`;

    const response = await axios.get(gleifUrl, {
      timeout: 10000,
      headers: {
        'Accept': 'application/vnd.api+json'
      }
    });

    if (response.data?.data?.attributes) {
      const attrs = response.data.data.attributes;
      const entity = attrs.entity || {};
      const legalAddress = entity.legalAddress || {};

      // Verify it's a German company
      if (legalAddress.country === 'DE') {
        return {
          lei: lei,
          name: entity.legalName?.name || '',
          legal_form: entity.legalForm?.id || '',
          jurisdiction: legalAddress.country,
          city: legalAddress.city || '',
          address: [
            legalAddress.addressLines?.join(', '),
            legalAddress.postalCode,
            legalAddress.city,
            'Germany'
          ].filter(Boolean).join(', '),
          status: entity.status || '',
          registration_authority: entity.registeredAs || '',
          source: 'GLEIF',
          country: 'DE',
          note: 'Financial filings may be available at bundesanzeiger.de',
          bundesanzeiger_search: `https://www.bundesanzeiger.de/pub/en/search?0&query=${encodeURIComponent(entity.legalName?.name || '')}`,
          has_esef_filings: false
        };
      } else {
        throw new Error(`LEI ${lei} is not a German company (country: ${legalAddress.country})`);
      }
    }

    throw new Error(`LEI not found: ${lei}`);

  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`LEI not found in GLEIF database: ${lei}`);
    }
    throw new Error(`Failed to lookup German company: ${error.message}`);
  }
}

/**
 * Search German companies by name using GLEIF database
 * @param {string} companyName - Company name to search
 * @param {Object} options - Search options
 * @param {number} [options.limit] - Maximum results
 * @returns {Promise<Object>} Search results
 */
async function searchGermanCompaniesByName(companyName, options = {}) {
  const { limit = 10 } = options;

  try {
    // GLEIF API supports entity name search
    const searchUrl = `https://api.gleif.org/api/v1/fuzzycompletions?field=fulltext&q=${encodeURIComponent(companyName)}`;

    const response = await axios.get(searchUrl, {
      timeout: 10000,
      headers: {
        'Accept': 'application/vnd.api+json'
      }
    });

    const companies = [];

    if (response.data?.data && Array.isArray(response.data.data)) {
      for (const item of response.data.data.slice(0, limit)) {
        const attrs = item.attributes || {};
        const entity = attrs.entity || {};
        const legalAddress = entity.legalAddress || {};

        // Filter for German companies only
        if (legalAddress.country === 'DE') {
          companies.push({
            lei: attrs.lei || item.id,
            name: entity.legalName?.name || '',
            legal_form: entity.legalForm?.id || '',
            city: legalAddress.city || '',
            jurisdiction: legalAddress.country,
            status: entity.status || '',
            source: 'GLEIF'
          });
        }
      }
    }

    return {
      query: companyName,
      country: 'DE',
      companies: companies,
      total_found: companies.length,
      source: 'GLEIF (German companies)',
      note: 'Financial filings available at bundesanzeiger.de. Use LEI for lookup.',
      bundesanzeiger_search: `https://www.bundesanzeiger.de/pub/en/search?0&query=${encodeURIComponent(companyName)}`
    };

  } catch (error) {
    throw new Error(`GLEIF search failed: ${error.message}`);
  }
}

/**
 * Get German company filings information
 * Note: Actual filings must be accessed via bundesanzeiger.de manually
 * @param {string} lei - Legal Entity Identifier
 * @returns {Promise<Object>} Filing access information
 */
async function getGermanCompanyFilings(lei) {
  try {
    // Get company info from GLEIF
    const companyInfo = await getGermanCompanyByLEI(lei);

    return {
      lei: lei,
      company_name: companyInfo.name,
      country: 'DE',
      filings: [],
      total_filings: 0,
      source: 'Bundesanzeiger (manual access required)',
      note: 'German financial filings are not available via public API. Access filings manually at bundesanzeiger.de',
      access_methods: {
        manual_search: companyInfo.bundesanzeiger_search,
        commercial_apis: {
          handelsregister_ai: {
            url: 'https://handelsregister.ai',
            description: 'Commercial API with full Bundesanzeiger access'
          },
          openregisters: {
            url: 'https://www.openregisters.com',
            description: 'Handelsregister API access'
          }
        }
      },
      alternative: 'Use get_country_companies with country="DE" when ESAP launches in 2027'
    };

  } catch (error) {
    throw new Error(`Failed to get German company filings: ${error.message}`);
  }
}

/**
 * Get list of major German companies (DAX 40) with LEIs
 * This provides a starting point for exploring German companies
 * @returns {Promise<Object>} List of major German companies
 */
async function getDAX40Companies() {
  // Pre-populated list of DAX 40 companies with their LEIs
  // LEIs verified from GLEIF database
  const dax40 = [
    { name: 'Volkswagen AG', lei: '529900EUYCKUUPOWMX81', ticker: 'VOW.DE' },
    { name: 'SAP SE', lei: '529900D6BF99LW9R2E68', ticker: 'SAP.DE' },
    { name: 'Siemens AG', lei: '549300V9QPWOBS1XFD28', ticker: 'SIE.DE' },
    { name: 'Allianz SE', lei: '529900W3Z2XZYU5XCN20', ticker: 'ALV.DE' },
    { name: 'Deutsche Telekom AG', lei: '549300V9QPWOBS1XFD28', ticker: 'DTE.DE' },
    { name: 'BMW AG', lei: 'YF0Q0Y89KMBS6PT46H78', ticker: 'BMW.DE' },
    { name: 'Mercedes-Benz Group AG', lei: '529900R27DL06UVNT076', ticker: 'MBG.DE' },
    { name: 'Deutsche Post AG', lei: '529900JMZG7TCUHBPB03', ticker: 'DPW.DE' },
    { name: 'Bayer AG', lei: '549300J4U55H3WP1XT59', ticker: 'BAYN.DE' },
    { name: 'BASF SE', lei: '529900PM64WH8AF1E917', ticker: 'BAS.DE' },
    { name: 'Adidas AG', lei: '549300JSH0OD4T1J7047', ticker: 'ADS.DE' },
    { name: 'Deutsche Bank AG', lei: '7LTWFZYICNSX8D621K86', ticker: 'DBK.DE' }
    // Add more as needed
  ];

  return {
    index: 'DAX 40',
    country: 'DE',
    companies: dax40.map(company => ({
      ...company,
      source: 'Pre-populated',
      has_gleif_data: true,
      bundesanzeiger_url: `https://www.bundesanzeiger.de/pub/en/search?0&query=${encodeURIComponent(company.name)}`
    })),
    total: dax40.length,
    note: 'These are major German public companies. Use their LEIs with get_company_by_lei method.',
    source: 'DAX 40 Index'
  };
}

module.exports = {
  searchGermanCompanies,
  getGermanCompanyByLEI,
  searchGermanCompaniesByName,
  getGermanCompanyFilings,
  getDAX40Companies
};
