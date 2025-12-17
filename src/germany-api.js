const axios = require('axios');

/**
 * German company data via GLEIF API
 *
 * Data sources:
 * - GLEIF API: 223,000+ German companies with LEIs
 * - Bundesanzeiger: Manual access for financial filings
 */

const GLEIF_API_BASE = 'https://api.gleif.org/api/v1';

/**
 * Search for German companies by name using GLEIF database
 * @param {string} companyName - Company name to search
 * @param {Object} options - Search options
 * @param {number} [options.limit] - Maximum results (default: 20)
 * @returns {Promise<Object>} Search results
 */
async function searchGermanCompaniesByName(companyName, options = {}) {
  const { limit = 20 } = options;

  try {
    // Use GLEIF lei-records endpoint with name filter (more reliable than fuzzy)
    const searchUrl = `${GLEIF_API_BASE}/lei-records?filter[entity.legalAddress.country]=DE&filter[entity.legalName]=${encodeURIComponent(companyName)}&page[size]=${limit}`;

    const response = await axios.get(searchUrl, {
      timeout: 15000,
      headers: {
        'Accept': 'application/vnd.api+json'
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
          legal_form: entity.legalForm?.id || '',
          city: legalAddress.city || '',
          postal_code: legalAddress.postalCode || '',
          status: entity.status || '',
          registered_as: entity.registeredAs || '',
          source: 'GLEIF'
        });
      }
    }

    return {
      query: companyName,
      country: 'DE',
      companies: companies,
      total_found: companies.length,
      total_in_gleif: response.data?.meta?.pagination?.total || companies.length,
      source: 'GLEIF API',
      note: 'Financial filings available at bundesanzeiger.de',
      bundesanzeiger_search: `https://www.bundesanzeiger.de/pub/en/search?0&query=${encodeURIComponent(companyName)}`
    };

  } catch (error) {
    throw new Error(`GLEIF search failed: ${error.message}`);
  }
}

/**
 * Get German company by LEI using GLEIF
 * @param {string} lei - Legal Entity Identifier
 * @returns {Promise<Object>} Company information
 */
async function getGermanCompanyByLEI(lei) {
  try {
    const gleifUrl = `${GLEIF_API_BASE}/lei-records/${lei}`;

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

      if (legalAddress.country === 'DE') {
        return {
          lei: lei,
          name: entity.legalName?.name || '',
          legal_form: entity.legalForm?.id || '',
          jurisdiction: legalAddress.country,
          city: legalAddress.city || '',
          postal_code: legalAddress.postalCode || '',
          address: [
            legalAddress.addressLines?.join(', '),
            legalAddress.postalCode,
            legalAddress.city,
            'Germany'
          ].filter(Boolean).join(', '),
          status: entity.status || '',
          registered_as: entity.registeredAs || '',
          source: 'GLEIF',
          country: 'DE',
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
 * Get German companies from GLEIF (dynamic, not hardcoded)
 * @param {Object} options - Options
 * @param {number} [options.limit] - Maximum results (default: 50)
 * @param {string} [options.city] - Filter by city
 * @param {string} [options.legal_form] - Filter by legal form (e.g., 'AG', 'SE', 'GmbH')
 * @returns {Promise<Object>} German companies from GLEIF
 */
async function getGermanCompanies(options = {}) {
  const { limit = 50, legal_form } = options;

  try {
    let url = `${GLEIF_API_BASE}/lei-records?filter[entity.legalAddress.country]=DE&filter[entity.status]=ACTIVE&page[size]=${limit}`;

    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'Accept': 'application/vnd.api+json'
      }
    });

    let companies = [];

    if (response.data?.data && Array.isArray(response.data.data)) {
      companies = response.data.data.map(record => {
        const attrs = record.attributes || {};
        const entity = attrs.entity || {};
        const legalAddress = entity.legalAddress || {};

        return {
          lei: attrs.lei,
          name: entity.legalName?.name || '',
          legal_form: entity.legalForm?.id || '',
          city: legalAddress.city || '',
          postal_code: legalAddress.postalCode || '',
          status: entity.status || '',
          source: 'GLEIF'
        };
      });

      // Client-side filter for legal form if specified
      if (legal_form) {
        const formUpper = legal_form.toUpperCase();
        companies = companies.filter(c =>
          c.name.toUpperCase().includes(formUpper) ||
          (c.legal_form && c.legal_form.toUpperCase().includes(formUpper))
        );
      }
    }

    return {
      country: 'DE',
      companies: companies,
      total_returned: companies.length,
      total_in_gleif: response.data?.meta?.pagination?.total || 0,
      filters: { legal_form },
      source: 'GLEIF API',
      note: 'Use searchGermanCompaniesByName for name-based search'
    };

  } catch (error) {
    throw new Error(`Failed to get German companies: ${error.message}`);
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
 * Get DAX 40 companies with verified LEIs
 * Complete list of all 40 DAX index constituents
 * @returns {Promise<Object>} DAX 40 companies
 */
async function getDAX40Companies() {
  // Complete DAX 40 list - LEIs verified against GLEIF API on 2025-12-16
  const dax40 = [
    { name: 'adidas AG', lei: '549300JSX0Z4CW0V5023', ticker: 'ADS.DE' },
    { name: 'Airbus SE', lei: 'MINO79WLOO247M1IL051', ticker: 'AIR.DE', country: 'NL' }, // HQ in Netherlands
    { name: 'Allianz SE', lei: '529900K9B0N5BT694847', ticker: 'ALV.DE' },
    { name: 'BASF SE', lei: '529900PM64WH8AF1E917', ticker: 'BAS.DE' },
    { name: 'Bayer AG', lei: '549300J4U55H3WP1XT59', ticker: 'BAYN.DE' },
    { name: 'Beiersdorf AG', lei: 'L47NHHI0Z9X22DV46U41', ticker: 'BEI.DE' },
    { name: 'Bayerische Motoren Werke AG', lei: 'YEH5ZCD6E441RHVHD759', ticker: 'BMW.DE' },
    { name: 'Brenntag SE', lei: 'NNROIXVWJ7CPSR27SV97', ticker: 'BNR.DE' },
    { name: 'COMMERZBANK Aktiengesellschaft', lei: '851WYGNLUQLFZBSYGB56', ticker: 'CBK.DE' },
    { name: 'Continental Aktiengesellschaft', lei: '529900A7YD9C0LLXM621', ticker: 'CON.DE' },
    { name: 'Covestro AG', lei: '3912005AWHKLQ1CPLV11', ticker: '1COV.DE' },
    { name: 'Daimler Truck Holding AG', lei: '529900PW78JIYOUBSR24', ticker: 'DTG.DE' },
    { name: 'Deutsche Bank AG', lei: '7LTWFZYICNSX8D621K86', ticker: 'DBK.DE' },
    { name: 'Deutsche Börse AG', lei: '529900G3SW56SHYNPR95', ticker: 'DB1.DE' },
    { name: 'Deutsche Post AG', lei: '8ER8GIG7CSMVD8VUFE78', ticker: 'DHL.DE' },
    { name: 'Deutsche Telekom AG', lei: '549300V9QSIG4WX4GJ96', ticker: 'DTE.DE' },
    { name: 'E.ON SE', lei: 'Q9MAIUP40P25UFBFG033', ticker: 'EOAN.DE' },
    { name: 'Fresenius SE & Co. KGaA', lei: 'XDFJ0CYCOO1FXRFTQS51', ticker: 'FRE.DE' },
    { name: 'Hannover Rück SE', lei: '529900KIN5BE45V5KB18', ticker: 'HNR1.DE' },
    { name: 'Heidelberg Materials AG', lei: 'LZ2C6E0W5W7LQMX5ZI37', ticker: 'HEI.DE' },
    { name: 'Henkel AG & Co. KGaA', lei: '549300VZCL1HTH4O4Y49', ticker: 'HEN3.DE' },
    { name: 'Infineon Technologies AG', lei: 'TSI2PJM6EPETEQ4X1U25', ticker: 'IFX.DE' },
    { name: 'Mercedes-Benz Group AG', lei: '529900R27DL06UVNT076', ticker: 'MBG.DE' },
    { name: 'Merck KGaA', lei: '529900OAREIS0MOPTW25', ticker: 'MRK.DE' },
    { name: 'MTU Aero Engines AG', lei: '529900807L67JY81RD65', ticker: 'MTX.DE' },
    { name: 'Münchener Rückversicherungs-Gesellschaft AG', lei: '529900MUF4C20K50JS49', ticker: 'MUV2.DE' },
    { name: 'Porsche Automobil Holding SE', lei: '52990053Z17ZYM1KFV27', ticker: 'PAH3.DE' },
    { name: 'Dr. Ing. h.c. F. Porsche Aktiengesellschaft', lei: '529900EWEX125AULXI58', ticker: 'P911.DE' },
    { name: 'QIAGEN N.V.', lei: '54930036WK3GMCN17Z57', ticker: 'QIA.DE', country: 'NL' }, // HQ in Netherlands
    { name: 'Rheinmetall Aktiengesellschaft', lei: '5299001OU9CSE29O6S05', ticker: 'RHM.DE' },
    { name: 'RWE Aktiengesellschaft', lei: '529900GB7KCA94ACC940', ticker: 'RWE.DE' },
    { name: 'SAP SE', lei: '529900D6BF99LW9R2E68', ticker: 'SAP.DE' },
    { name: 'Sartorius Aktiengesellschaft', lei: '529900EQV2DY4FOAMU38', ticker: 'SRT3.DE' },
    { name: 'Siemens AG', lei: 'W38RGI023J3WT1HWRP32', ticker: 'SIE.DE' },
    { name: 'Siemens Energy AG', lei: '5299005CHJZ14D4FDJ62', ticker: 'ENR.DE' },
    { name: 'Siemens Healthineers AG', lei: '529900QBVWXMWANH7H45', ticker: 'SHL.DE' },
    { name: 'Symrise AG', lei: '529900D82I6R9601CF26', ticker: 'SY1.DE' },
    { name: 'Volkswagen AG', lei: '529900NNUPAGGOMPXZ31', ticker: 'VOW3.DE' },
    { name: 'Vonovia SE', lei: '5299005A2ZEP6AP7KM81', ticker: 'VNA.DE' },
    { name: 'Zalando SE', lei: '529900YRFFGH5AXU4S86', ticker: 'ZAL.DE' }
  ];

  return {
    index: 'DAX 40',
    country: 'DE',
    companies: dax40.map(company => ({
      ...company,
      source: 'DAX 40 Index',
      bundesanzeiger_url: `https://www.bundesanzeiger.de/pub/en/search?0&query=${encodeURIComponent(company.name)}`
    })),
    total: dax40.length,
    note: 'Complete DAX 40 index constituents. Use LEIs with get_company_by_lei for details.',
    source: 'DAX 40 Index (LEIs verified via GLEIF)',
    last_updated: '2025-12-16'
  };
}

// Keep old function name for compatibility
async function searchGermanCompanies(query, options = {}) {
  return searchGermanCompaniesByName(query, options);
}

module.exports = {
  searchGermanCompanies,
  searchGermanCompaniesByName,
  getGermanCompanyByLEI,
  getGermanCompanies,
  getGermanCompanyFilings,
  getDAX40Companies
};
