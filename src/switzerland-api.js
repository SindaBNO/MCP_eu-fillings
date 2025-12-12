const axios = require('axios');

const ZEFIX_API_BASE = 'https://www.zefix.admin.ch/ZefixPublicREST/api/v1';
const GLEIF_API_BASE = 'https://api.gleif.org/api/v1';

/**
 * Search Swiss companies via ZEFIX (Swiss Commercial Register)
 * @param {string} query - Company name to search
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with company metadata
 */
async function searchSwissCompanies(query, options = {}) {
  const { limit = 10, canton } = options;

  try {
    // Note: ZEFIX REST API endpoints require specific format
    // Using GLEIF as primary source for Swiss companies with LEIs
    const gleifUrl = `${GLEIF_API_BASE}/lei-records`;
    const params = new URLSearchParams({
      'filter[entity.legalAddress.country]': 'CH',
      'filter[entity.legalName]': `*${query}*`,
      'page[size]': limit.toString()
    });

    const response = await axios.get(`${gleifUrl}?${params}`, {
      timeout: 15000,
      headers: {
        'Accept': 'application/vnd.api+json'
      }
    });

    const companies = response.data.data.map(record => {
      const attrs = record.attributes;
      return {
        name: attrs.entity.legalName.name,
        lei: attrs.lei,
        legal_form: attrs.entity.legalForm?.id || 'Unknown',
        status: attrs.entity.status,
        registration_number: attrs.entity.registeredAs || null,
        address: {
          city: attrs.entity.legalAddress.city,
          postal_code: attrs.entity.legalAddress.postalCode,
          country: attrs.entity.legalAddress.country
        },
        registration_date: attrs.registration?.initialRegistrationDate || null,
        source: 'GLEIF (Swiss Registry)'
      };
    });

    return {
      query,
      companies,
      total_found: companies.length,
      country: 'CH',
      source: 'GLEIF API for Swiss Companies',
      note: 'For financial reports, see get_six_listed_companies for direct report links'
    };

  } catch (error) {
    throw new Error(`Swiss company search failed: ${error.message}`);
  }
}

/**
 * Get Swiss company information by LEI or CHE number
 * @param {string} identifier - LEI (20 chars) or CHE registration number
 * @returns {Promise<Object>} Company details
 */
async function getSwissCompanyInfo(identifier) {
  try {
    // Check if it's a LEI (20 alphanumeric characters)
    if (identifier.length === 20 && /^[A-Z0-9]+$/i.test(identifier)) {
      // Lookup by LEI
      const gleifUrl = `${GLEIF_API_BASE}/lei-records/${identifier}`;
      const response = await axios.get(gleifUrl, {
        timeout: 15000,
        headers: { 'Accept': 'application/vnd.api+json' }
      });

      const attrs = response.data.data.attributes;

      // Check if it's actually a Swiss company
      if (attrs.entity.legalAddress.country !== 'CH') {
        throw new Error(`LEI ${identifier} belongs to ${attrs.entity.legalAddress.country}, not Switzerland`);
      }

      return {
        lei: attrs.lei,
        name: attrs.entity.legalName.name,
        legal_form: attrs.entity.legalForm?.id || 'Unknown',
        registration_number: attrs.entity.registeredAs || null,
        status: attrs.entity.status,
        address: {
          street: attrs.entity.legalAddress.addressLines?.join(', '),
          city: attrs.entity.legalAddress.city,
          postal_code: attrs.entity.legalAddress.postalCode,
          region: attrs.entity.legalAddress.region,
          country: attrs.entity.legalAddress.country
        },
        headquarters_address: attrs.entity.headquartersAddress ? {
          city: attrs.entity.headquartersAddress.city,
          country: attrs.entity.headquartersAddress.country
        } : null,
        registration: {
          authority: attrs.entity.registrationAuthority?.id || null,
          date: attrs.registration?.initialRegistrationDate || null,
          last_updated: attrs.registration?.lastUpdateDate || null
        },
        category: attrs.entity.category || null,
        expiration_date: attrs.registration?.nextRenewalDate || null,
        source: 'GLEIF',
        country: 'Switzerland'
      };

    } else {
      // CHE number format - would need ZEFIX integration
      throw new Error('CHE number lookup not yet implemented. Use LEI instead.');
    }

  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`Swiss company not found: ${identifier}`);
    }
    throw new Error(`Failed to get Swiss company info: ${error.message}`);
  }
}

/**
 * Get curated list of major SIX Swiss Exchange listed companies
 * Includes direct links to investor relations and annual reports
 * @returns {Promise<Object>} List of major Swiss companies with financial report links
 */
async function getSIXListedCompanies() {
  // Curated list of top Swiss companies listed on SIX Swiss Exchange
  // Similar to DAX 40 approach - manually maintained for reliability

  const companies = [
    {
      name: 'Nestlé S.A.',
      lei: '549300I6XJYZ0ZNUGV06',
      ticker: 'NESN',
      isin: 'CH0038863350',
      sector: 'Food & Beverage',
      market_cap: 'CHF 250B+',
      website: 'https://www.nestle.com',
      investor_relations: {
        main_url: 'https://www.nestle.com/investors',
        annual_reports: 'https://www.nestle.com/investors/publications',
        financial_statements: 'https://www.nestle.com/investors/financial-statements',
        note: 'Reports available in PDF and interactive formats'
      }
    },
    {
      name: 'Roche Holding AG',
      lei: '549300U41AUUVOAAOB37',
      ticker: 'ROG',
      isin: 'CH0012032113',
      sector: 'Pharmaceuticals',
      market_cap: 'CHF 200B+',
      website: 'https://www.roche.com',
      investor_relations: {
        main_url: 'https://www.roche.com/investors',
        annual_reports: 'https://www.roche.com/investors/annualreport',
        financial_statements: 'https://www.roche.com/investors/financials',
        note: 'Full annual reports and half-year results available'
      }
    },
    {
      name: 'Novartis AG',
      lei: '5493007HIVTX6SY6XD66',
      ticker: 'NOVN',
      isin: 'CH0012005267',
      sector: 'Pharmaceuticals',
      market_cap: 'CHF 180B+',
      website: 'https://www.novartis.com',
      investor_relations: {
        main_url: 'https://www.novartis.com/investors',
        annual_reports: 'https://www.novartis.com/investors/financial-data/annual-results',
        financial_statements: 'https://www.novartis.com/investors/financial-data',
        note: 'Annual reports, financial statements, and ESG reports'
      }
    },
    {
      name: 'UBS Group AG',
      lei: '549300SZJ9VS8SGXAN81',
      ticker: 'UBSG',
      isin: 'CH0244767585',
      sector: 'Banking',
      market_cap: 'CHF 90B+',
      website: 'https://www.ubs.com',
      investor_relations: {
        main_url: 'https://www.ubs.com/global/en/investor-relations.html',
        annual_reports: 'https://www.ubs.com/global/en/investor-relations/financial-information/annual-reporting.html',
        financial_statements: 'https://www.ubs.com/global/en/investor-relations/financial-information.html',
        note: 'Comprehensive financial reporting and regulatory filings'
      }
    },
    {
      name: 'Zurich Insurance Group AG',
      lei: '529900QBFJ5KWFL38T62',
      ticker: 'ZURN',
      isin: 'CH0011075394',
      sector: 'Insurance',
      market_cap: 'CHF 65B+',
      website: 'https://www.zurich.com',
      investor_relations: {
        main_url: 'https://www.zurich.com/investor-relations',
        annual_reports: 'https://www.zurich.com/investor-relations/results-and-reports/annual-reports',
        financial_statements: 'https://www.zurich.com/investor-relations/results-and-reports',
        note: 'Annual reports, half-year results, and quarterly updates'
      }
    },
    {
      name: 'ABB Ltd',
      lei: 'DB5OWK0RI01U6API3V14',
      ticker: 'ABBN',
      isin: 'CH0012221716',
      sector: 'Industrial Engineering',
      market_cap: 'CHF 95B+',
      website: 'https://www.abb.com',
      investor_relations: {
        main_url: 'https://global.abb/group/en/investors',
        annual_reports: 'https://global.abb/group/en/investors/reports',
        financial_statements: 'https://global.abb/group/en/investors/financial-information',
        note: 'Full annual reports and quarterly results'
      }
    },
    {
      name: 'Lonza Group AG',
      lei: '549300EFW4H2TCZ71055',
      ticker: 'LONN',
      isin: 'CH0013841017',
      sector: 'Pharmaceuticals & Biotechnology',
      market_cap: 'CHF 30B+',
      website: 'https://www.lonza.com',
      investor_relations: {
        main_url: 'https://www.lonza.com/investors',
        annual_reports: 'https://www.lonza.com/investors/financial-reports',
        financial_statements: 'https://www.lonza.com/investors/financial-data',
        note: 'Annual reports and half-year financial statements'
      }
    },
    {
      name: 'Richemont (Compagnie Financière)',
      lei: '549300MWKDVZ0SS7JU34',
      ticker: 'CFR',
      isin: 'CH0210483332',
      sector: 'Luxury Goods',
      market_cap: 'CHF 75B+',
      website: 'https://www.richemont.com',
      investor_relations: {
        main_url: 'https://www.richemont.com/investors',
        annual_reports: 'https://www.richemont.com/investors/results-reports',
        financial_statements: 'https://www.richemont.com/investors/financial-information',
        note: 'Annual reports and interim financial statements'
      }
    },
    {
      name: 'Swiss Re AG',
      lei: '549300OHWYT4WX14N820',
      ticker: 'SREN',
      isin: 'CH0126881561',
      sector: 'Reinsurance',
      market_cap: 'CHF 35B+',
      website: 'https://www.swissre.com',
      investor_relations: {
        main_url: 'https://www.swissre.com/investors',
        annual_reports: 'https://www.swissre.com/investors/financial-reports',
        financial_statements: 'https://www.swissre.com/investors/financials',
        note: 'Full annual reports and quarterly updates'
      }
    },
    {
      name: 'Sika AG',
      lei: '5299002OHQESGKWGP521',
      ticker: 'SIKA',
      isin: 'CH0418792922',
      sector: 'Chemicals & Materials',
      market_cap: 'CHF 40B+',
      website: 'https://www.sika.com',
      investor_relations: {
        main_url: 'https://www.sika.com/en/investors.html',
        annual_reports: 'https://www.sika.com/en/investors/reports-publications.html',
        financial_statements: 'https://www.sika.com/en/investors/financial-information.html',
        note: 'Annual reports and half-year results'
      }
    }
  ];

  return {
    companies,
    total_companies: companies.length,
    exchange: 'SIX Swiss Exchange',
    country: 'Switzerland',
    source: 'Curated List',
    note: 'Top Swiss blue-chip companies with direct links to financial reports',
    data_access: {
      automated: 'Not available without FinancialReports.eu subscription',
      manual: 'Click investor_relations URLs for direct access to reports',
      formats: 'Most companies provide PDF annual reports and financial statements',
      standards: 'Reports follow Swiss GAAP FER, IFRS, or US-GAAP depending on company'
    }
  };
}

module.exports = {
  searchSwissCompanies,
  getSwissCompanyInfo,
  getSIXListedCompanies
};
