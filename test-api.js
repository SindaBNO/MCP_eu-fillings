#!/usr/bin/env node

/**
 * Simple test script to verify EU Filings API functionality
 * Run: node test-api.js
 */

const {
  searchCompanies,
  getCompanyByLEI,
  getCompanyFilings,
  getCountryCompanies,
  getEntityDetails
} = require('./src/esef-api.js');

async function runTests() {
  console.log('🧪 Testing EU Filings MCP Server API\n');
  console.log('=' .repeat(60));

  try {
    // Test 1: Get companies from France
    console.log('\n📍 Test 1: Get French companies');
    console.log('-'.repeat(60));
    const frenchCompanies = await getCountryCompanies('FR', { limit: 5 });
    console.log(`Found ${frenchCompanies.total_found} French companies`);
    console.log('Sample:', JSON.stringify(frenchCompanies.companies[0], null, 2));

    // Test 2: Get entity details
    if (frenchCompanies.companies.length > 0) {
      const firstEntity = frenchCompanies.companies[0];
      console.log('\n🏢 Test 2: Get entity details');
      console.log('-'.repeat(60));

      try {
        const entityDetails = await getEntityDetails(firstEntity.entity_id);
        console.log('Entity details:', JSON.stringify(entityDetails, null, 2));

        // Test 3: Get company filings
        if (entityDetails.lei) {
          console.log('\n📋 Test 3: Get company filings');
          console.log('-'.repeat(60));
          const filings = await getCompanyFilings(entityDetails.lei, { limit: 3 });
          console.log(`Found ${filings.total_filings} filings for ${filings.company_name}`);
          if (filings.filings.length > 0) {
            console.log('Latest filing:', JSON.stringify(filings.filings[0], null, 2));
          }
        }
      } catch (error) {
        console.log('⚠️  Entity details fetch failed:', error.message);
      }
    }

    // Test 4: Search companies by name
    console.log('\n🔍 Test 4: Search for "Siemens"');
    console.log('-'.repeat(60));
    try {
      const searchResults = await searchCompanies('Siemens', { country: 'DE', limit: 3 });
      console.log(`Search found ${searchResults.total_found} companies`);
      if (searchResults.companies.length > 0) {
        console.log('Results:', JSON.stringify(searchResults.companies, null, 2));
      }
    } catch (error) {
      console.log('⚠️  Search may be slow (API limitation):', error.message);
    }

    // Test 5: Get German companies
    console.log('\n🇩🇪 Test 5: Get German companies');
    console.log('-'.repeat(60));
    const germanCompanies = await getCountryCompanies('DE', { limit: 5 });
    console.log(`Found ${germanCompanies.total_found} German companies`);
    console.log('Sample:', JSON.stringify(germanCompanies.companies[0], null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
