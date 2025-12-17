#!/usr/bin/env node

/**
 * Test UK Companies House API integration
 *
 * SETUP:
 * 1. Get free API key from https://developer.company-information.service.gov.uk/
 * 2. Run: UK_COMPANIES_HOUSE_API_KEY=your_key node scripts/test-uk.js
 */

const {
  searchUKCompanies,
  getUKCompanyProfile,
  getUKCompanyFilings,
  getUKCompanyAccounts,
  getFTSE100Companies
} = require('../src/uk-api.js');

async function testUK() {
  console.log('=== Testing UK Companies House API ===\n');

  if (!process.env.UK_COMPANIES_HOUSE_API_KEY) {
    console.log('No API key set. Testing FTSE100 (no API required):\n');

    const ftse = await getFTSE100Companies();
    console.log('FTSE 100:', ftse.total, 'companies');
    ftse.companies.slice(0, 5).forEach(c => {
      console.log(' -', c.name, '|', c.ticker, '|', c.company_number);
    });

    console.log('\nTo test full API functionality:');
    console.log('1. Register at https://developer.company-information.service.gov.uk/');
    console.log('2. Create an application and get API key');
    console.log('3. Run: UK_COMPANIES_HOUSE_API_KEY=your_key node scripts/test-uk.js');
    return;
  }

  try {
    // Test 1: Search companies
    console.log('Test 1: Search "Shell"');
    console.log('-'.repeat(50));
    const search = await searchUKCompanies('Shell', { limit: 3 });
    console.log('Found:', search.total_found, '(total:', search.total_available + ')');
    search.companies.forEach(c => console.log(' -', c.name, '|', c.company_number));

    // Test 2: Get company profile (Shell)
    console.log('\nTest 2: Get Shell profile (04366849)');
    console.log('-'.repeat(50));
    const profile = await getUKCompanyProfile('04366849');
    console.log('Name:', profile.name);
    console.log('Status:', profile.company_status);
    console.log('Type:', profile.company_type);
    console.log('Created:', profile.date_of_creation);

    // Test 3: Get filing history
    console.log('\nTest 3: Get Shell filings');
    console.log('-'.repeat(50));
    const filings = await getUKCompanyFilings('04366849', { limit: 5 });
    console.log('Total filings:', filings.total_available);
    filings.filings.slice(0, 3).forEach(f => {
      console.log(' -', f.date, '|', f.type, '|', f.category);
    });

    // Test 4: Get accounts
    console.log('\nTest 4: Get Shell accounts');
    console.log('-'.repeat(50));
    const accounts = await getUKCompanyAccounts('04366849', { limit: 5 });
    console.log('Company:', accounts.company_name);
    console.log('Accounts found:', accounts.total_accounts);
    accounts.accounts.slice(0, 3).forEach(a => {
      console.log(' -', a.date, '|', a.description);
    });

    // Test 5: FTSE 100
    console.log('\nTest 5: FTSE 100 list');
    console.log('-'.repeat(50));
    const ftse = await getFTSE100Companies();
    console.log('FTSE 100:', ftse.total, 'companies');

    console.log('\n=== All UK tests passed! ===');

  } catch (error) {
    console.error('\nTest failed:', error.message);
    process.exit(1);
  }
}

testUK().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
