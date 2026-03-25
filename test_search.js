const { searchCompanies } = require('./src/esef-api.js');

async function test() {
    const results = await searchCompanies('Total Energie');
    console.log(JSON.stringify(results, null, 2));
}

test();
