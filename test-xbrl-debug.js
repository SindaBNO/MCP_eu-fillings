#!/usr/bin/env node

const axios = require('axios');
const { downloadAndParseXBRL, findDimensionalFacts } = require('./src/xbrl-parser.js');

async function debugXBRL() {
  console.log('=== XBRL JSON DEBUG TEST ===\n');

  const jsonUrl = 'https://filings.xbrl.org/969500I1EJGUAT223F44/2025-06-30/ESEF/FR/0/ramsaysante-2025-06-30-0-fr.json';

  console.log('1. Downloading XBRL JSON from:', jsonUrl);

  try {
    const xbrlData = await downloadAndParseXBRL(jsonUrl, 'json');

    console.log('\n2. XBRL Data Structure:');
    console.log('   - Type:', typeof xbrlData);
    console.log('   - Is Array:', Array.isArray(xbrlData));
    console.log('   - Keys:', Object.keys(xbrlData).slice(0, 10));

    if (xbrlData.facts) {
      console.log('\n3. Facts Array:');
      console.log('   - Total facts:', xbrlData.facts.length);

      if (xbrlData.facts.length > 0) {
        console.log('\n4. Sample facts (first 5):');
        xbrlData.facts.slice(0, 5).forEach((fact, i) => {
          console.log(`\n   Fact ${i + 1}:`);
          console.log(`   - Concept: ${fact.concept}`);
          console.log(`   - Value: ${fact.value}`);
          console.log(`   - Type: ${typeof fact.value}`);
          console.log(`   - Dimensions: ${Object.keys(fact.dimensions || {}).length}`);
        });

        console.log('\n5. Testing findDimensionalFacts with wide range:');
        const results = findDimensionalFacts(xbrlData, {
          valueRange: {
            min: 1,
            max: Number.MAX_SAFE_INTEGER
          }
        });
        console.log(`   - Facts matching range: ${results.length}`);

        if (results.length > 0) {
          console.log('\n   First 3 matching facts:');
          results.slice(0, 3).forEach((fact, i) => {
            console.log(`   ${i + 1}. ${fact.concept}: ${fact.value}`);
          });
        }
      }
    } else {
      console.log('\n✗ No facts array found in parsed data');
      console.log('   Available keys:', Object.keys(xbrlData));
    }

  } catch (error) {
    console.log('\\n✗ Error:', error.message);
    console.log('Stack:', error.stack);
  }
}

debugXBRL().catch(console.error);
