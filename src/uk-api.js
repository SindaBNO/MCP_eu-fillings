const axios = require('axios');

/**
 * UK Companies House API Integration
 *
 * Free public API for UK company data and filings
 * API Docs: https://developer.company-information.service.gov.uk/
 *
 * SETUP REQUIRED:
 * 1. Register at https://developer.company-information.service.gov.uk/
 * 2. Create an application to get an API key
 * 3. Set environment variable: UK_COMPANIES_HOUSE_API_KEY=your_api_key
 *
 * The API key is free but required for all requests.
 */

const UK_API_BASE = 'https://api.company-information.service.gov.uk';

// API key - required, set via environment variable
const API_KEY = process.env.UK_COMPANIES_HOUSE_API_KEY || null;

/**
 * Make request to UK Companies House API
 */
async function makeUKRequest(endpoint, params = {}) {
  const url = `${UK_API_BASE}${endpoint}`;

  const config = {
    timeout: 15000,
    headers: {
      'Accept': 'application/json'
    },
    params
  };

  // Add API key authentication if available
  if (API_KEY) {
    config.auth = {
      username: API_KEY,
      password: ''
    };
  }

  // Check for API key before making request
  if (!API_KEY) {
    throw new Error('UK Companies House API requires an API key. Get one free at https://developer.company-information.service.gov.uk/ and set UK_COMPANIES_HOUSE_API_KEY environment variable.');
  }

  try {
    const response = await axios.get(url, config);
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('UK Companies House API: Invalid API key. Check UK_COMPANIES_HOUSE_API_KEY.');
    }
    if (error.response?.status === 404) {
      throw new Error('Company not found');
    }
    if (error.response?.status === 429) {
      throw new Error('UK Companies House API: Rate limit exceeded. Try again later or use API key.');
    }
    throw new Error(`UK Companies House API error: ${error.message}`);
  }
}

/**
 * Search for UK companies by name
 * @param {string} query - Company name to search
 * @param {Object} options - Search options
 * @param {number} [options.limit] - Maximum results (default: 20, max: 100)
 * @returns {Promise<Object>} Search results
 */
async function searchUKCompanies(query, options = {}) {
  const { limit = 20 } = options;

  const data = await makeUKRequest('/search/companies', {
    q: query,
    items_per_page: Math.min(limit, 100)
  });

  const companies = (data.items || []).map(item => ({
    company_number: item.company_number,
    name: item.title,
    company_status: item.company_status,
    company_type: item.company_type,
    date_of_creation: item.date_of_creation,
    address: item.address_snippet || '',
    country: 'GB',
    source: 'UK Companies House'
  }));

  return {
    query,
    companies,
    total_found: companies.length,
    total_available: data.total_results || companies.length,
    country: 'GB',
    source: 'UK Companies House',
    note: data.total_results > limit
      ? `Showing ${companies.length} of ${data.total_results} matches`
      : null
  };
}

/**
 * Get UK company profile by company number
 * @param {string} companyNumber - UK company number (8 digits)
 * @returns {Promise<Object>} Company profile
 */
async function getUKCompanyProfile(companyNumber) {
  const data = await makeUKRequest(`/company/${companyNumber}`);

  return {
    company_number: data.company_number,
    name: data.company_name,
    company_status: data.company_status,
    company_type: data.type,
    date_of_creation: data.date_of_creation,
    jurisdiction: data.jurisdiction,
    registered_office: data.registered_office_address ? {
      address_line_1: data.registered_office_address.address_line_1,
      address_line_2: data.registered_office_address.address_line_2,
      locality: data.registered_office_address.locality,
      postal_code: data.registered_office_address.postal_code,
      country: data.registered_office_address.country
    } : null,
    sic_codes: data.sic_codes || [],
    accounts: data.accounts ? {
      next_due: data.accounts.next_due,
      last_accounts: data.accounts.last_accounts,
      accounting_reference_date: data.accounts.accounting_reference_date
    } : null,
    confirmation_statement: data.confirmation_statement ? {
      next_due: data.confirmation_statement.next_due,
      last_made_up_to: data.confirmation_statement.last_made_up_to
    } : null,
    has_charges: data.has_charges || false,
    has_insolvency_history: data.has_insolvency_history || false,
    country: 'GB',
    source: 'UK Companies House'
  };
}

/**
 * Get filing history for a UK company
 * @param {string} companyNumber - UK company number
 * @param {Object} options - Options
 * @param {number} [options.limit] - Maximum filings to return (default: 25)
 * @param {string} [options.category] - Filter by category (accounts, confirmation-statement, etc.)
 * @returns {Promise<Object>} Filing history
 */
async function getUKCompanyFilings(companyNumber, options = {}) {
  const { limit = 25, category } = options;

  const params = {
    items_per_page: Math.min(limit, 100)
  };

  if (category) {
    params.category = category;
  }

  const data = await makeUKRequest(`/company/${companyNumber}/filing-history`, params);

  const filings = (data.items || []).map(item => ({
    transaction_id: item.transaction_id,
    date: item.date,
    type: item.type,
    description: item.description,
    category: item.category,
    subcategory: item.subcategory,
    description_values: item.description_values || {},
    paper_filed: item.paper_filed || false,
    links: item.links || {},
    // Document download link if available
    document_url: item.links?.document_metadata
      ? `https://find-and-update.company-information.service.gov.uk${item.links.document_metadata}`
      : null
  }));

  return {
    company_number: companyNumber,
    filings,
    total_filings: filings.length,
    total_available: data.total_count || filings.length,
    filing_history_status: data.filing_history_status,
    country: 'GB',
    source: 'UK Companies House',
    note: category ? `Filtered by category: ${category}` : null
  };
}

/**
 * Get accounts filings for a UK company
 * @param {string} companyNumber - UK company number
 * @param {Object} options - Options
 * @param {number} [options.limit] - Maximum filings (default: 10)
 * @returns {Promise<Object>} Account filings
 */
async function getUKCompanyAccounts(companyNumber, options = {}) {
  const { limit = 10 } = options;

  // Get filings filtered by accounts category
  const filingsData = await getUKCompanyFilings(companyNumber, {
    limit,
    category: 'accounts'
  });

  // Get company profile for additional account info
  let companyInfo = null;
  try {
    companyInfo = await getUKCompanyProfile(companyNumber);
  } catch (e) {
    // Continue without company info
  }

  return {
    company_number: companyNumber,
    company_name: companyInfo?.name || 'Unknown',
    accounts: filingsData.filings.map(f => ({
      transaction_id: f.transaction_id,
      date: f.date,
      type: f.type,
      description: f.description,
      period: f.description_values?.made_up_date || null,
      document_url: f.document_url
    })),
    total_accounts: filingsData.total_filings,
    next_accounts_due: companyInfo?.accounts?.next_due || null,
    last_accounts: companyInfo?.accounts?.last_accounts || null,
    country: 'GB',
    source: 'UK Companies House'
  };
}

/**
 * Get list of FTSE 100 companies (curated list with company numbers)
 * @returns {Promise<Object>} FTSE 100 companies
 */
async function getFTSE100Companies() {
  // Curated list of major FTSE 100 companies with company numbers
  const ftse100 = [
    { name: 'Shell plc', company_number: '04366849', ticker: 'SHEL.L' },
    { name: 'AstraZeneca PLC', company_number: '02723534', ticker: 'AZN.L' },
    { name: 'HSBC Holdings plc', company_number: '00617987', ticker: 'HSBA.L' },
    { name: 'Unilever PLC', company_number: '00041424', ticker: 'ULVR.L' },
    { name: 'BP p.l.c.', company_number: '00102498', ticker: 'BP.L' },
    { name: 'GlaxoSmithKline plc', company_number: '03888792', ticker: 'GSK.L' },
    { name: 'British American Tobacco p.l.c.', company_number: '03407696', ticker: 'BATS.L' },
    { name: 'Rio Tinto plc', company_number: '00719885', ticker: 'RIO.L' },
    { name: 'Diageo plc', company_number: '00023307', ticker: 'DGE.L' },
    { name: 'Glencore plc', company_number: 'JE00B4T3BW64', ticker: 'GLEN.L' },
    { name: 'RELX PLC', company_number: '00077536', ticker: 'REL.L' },
    { name: 'National Grid plc', company_number: '04031152', ticker: 'NG.L' },
    { name: 'Anglo American plc', company_number: '03564138', ticker: 'AAL.L' },
    { name: 'Prudential plc', company_number: '01397169', ticker: 'PRU.L' },
    { name: 'Barclays PLC', company_number: '00048839', ticker: 'BARC.L' },
    { name: 'Lloyds Banking Group plc', company_number: '00095000', ticker: 'LLOY.L' },
    { name: 'Vodafone Group Plc', company_number: '01833679', ticker: 'VOD.L' },
    { name: 'Tesco PLC', company_number: '00445790', ticker: 'TSCO.L' },
    { name: 'NatWest Group plc', company_number: 'SC045551', ticker: 'NWG.L' },
    { name: 'Rolls-Royce Holdings plc', company_number: '07524813', ticker: 'RR.L' }
  ];

  return {
    index: 'FTSE 100',
    country: 'GB',
    companies: ftse100.map(c => ({
      ...c,
      source: 'FTSE 100 Index',
      companies_house_url: `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`
    })),
    total: ftse100.length,
    note: 'Major FTSE 100 companies. Use company_number to get detailed filings.',
    source: 'FTSE 100 Index (curated list)'
  };
}

module.exports = {
  searchUKCompanies,
  getUKCompanyProfile,
  getUKCompanyFilings,
  getUKCompanyAccounts,
  getFTSE100Companies
};
