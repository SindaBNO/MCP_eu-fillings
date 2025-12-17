#!/usr/bin/env node

/**
 * Test script for EU Filings MCP Server API
 * Run: node scripts/test-api.js
 */

const {
  searchCompanies,
  getCompanyByLEI,
  getCompanyFilings,
  getCountryCompanies,
  getEntityDetails
} = require('../src/esef-api.js');

const { getDAX40Companies } = require('../src/germany-api.js');
const { getSIXListedCompanies } = require('../src/switzerland-api.js');

async function runTests() {
  console.log('Testing EU Filings MCP Server API\n');
  console.log('='.repeat(60));

  try {
    // Test 1: Search across multiple EU countries (GLEIF)
    console.log('\n Test 1: Search companies across EU (GLEIF API)');
    console.log('-'.repeat(60));

    const countries = [
      { code: 'FR', query: 'Total', name: 'France' },
      { code: 'DE', query: 'Siemens', name: 'Germany' },
      { code: 'IT', query: 'Fiat', name: 'Italy' },
      { code: 'ES', query: 'Santander', name: 'Spain' },
      { code: 'NL', query: 'Philips', name: 'Netherlands' },
    ];

    for (const c of countries) {
      const result = await searchCompanies(c.query, { country: c.code, limit: 2 });
      console.log(`${c.name}: "${c.query}" → ${result.total_found} found (${result.total_available} total)`);
      await new Promise(r => setTimeout(r, 200));
    }

    // Test 2: Get company by LEI
    console.log('\n Test 2: Get company by LEI');
    console.log('-'.repeat(60));
    const bmwLei = 'YEH5ZCD6E441RHVHD759'; // BMW
    const bmw = await getCompanyByLEI(bmwLei);
    console.log(`Company: ${bmw.name}`);
    console.log(`Country: ${bmw.country}, City: ${bmw.city}`);
    console.log(`Has ESEF filings: ${bmw.has_esef_filings}`);

    // Test 3: Get French companies with ESEF filings
    console.log('\n Test 3: Get companies with ESEF filings (France)');
    console.log('-'.repeat(60));
    const frenchCompanies = await getCountryCompanies('FR', { limit: 3 });
    console.log(`Found ${frenchCompanies.total_found} French companies with ESEF filings`);
    if (frenchCompanies.companies[0]) {
      const entity = frenchCompanies.companies[0];
      const details = await getEntityDetails(entity.entity_id);
      console.log(`Sample: ${details.name} (${details.lei})`);

      // Get filings
      const filings = await getCompanyFilings(details.lei, { limit: 2 });
      console.log(`Filings: ${filings.total_filings} found`);
    }

    // Test 4: DAX 40 curated list
    console.log('\n Test 4: DAX 40 curated list (Germany)');
    console.log('-'.repeat(60));
    const dax40 = await getDAX40Companies();
    console.log(`DAX 40: ${dax40.total} companies`);
    console.log(`Sample: ${dax40.companies[0].name} (${dax40.companies[0].ticker})`);

    // Test 5: SIX curated list
    console.log('\n Test 5: SIX curated list (Switzerland)');
    console.log('-'.repeat(60));
    const six = await getSIXListedCompanies();
    console.log(`SIX: ${six.total_companies} companies`);
    console.log(`Sample: ${six.companies[0].name} (${six.companies[0].ticker})`);

    console.log('\n' + '='.repeat(60));
    console.log('All tests passed!');
    console.log('='.repeat(60));

    console.log('\n API Architecture:');
    console.log('   GLEIF: 1.6M+ EU companies (search, LEI lookup)');
    console.log('   ESEF: Financial filings (FR, DK, GB, LT, UA)');
    console.log('   DAX40/SIX: Curated major company lists');

  } catch (error) {
    console.error('\n Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
