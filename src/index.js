#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const express = require('express');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const {
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
} = require('./esef-api.js');

const {
  searchGermanCompaniesByName,
  getGermanCompanyByLEI,
  getGermanCompanyFilings,
  getDAX40Companies
} = require('./germany-api.js');

const {
  searchSwissCompanies,
  getSwissCompanyInfo,
  getSIXListedCompanies
} = require('./switzerland-api.js');

const {
  searchUKCompanies,
  getUKCompanyProfile,
  getUKCompanyFilings,
  getUKCompanyAccounts,
  getFTSE100Companies
} = require('./uk-api.js');

const { buildFactTable } = require('./fact-table-builder.js');
const { timeSeriesAnalysis } = require('./time-series-analyzer.js');

const server = new Server(
  {
    name: 'eu-filings-mcp-server',
    version: '0.0.1',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'eu-filings',
        description: 'Unified tool for European financial filings via ESEF (European Single Electronic Format): access company filings, financial statements, and XBRL data from EU regulated markets. Provides comprehensive access to financial reports from 27+ European countries using the filings.xbrl.org API.',
        inputSchema: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              enum: [
                'search_companies',
                'get_company_by_lei',
                'get_company_filings',
                'get_country_companies',
                'get_entity_details',
                'get_filing_facts',
                'get_filing_validation',
                'filter_filings',
                'get_dax40_companies',
                'search_swiss_companies',
                'get_swiss_company_info',
                'get_six_listed_companies',
                'search_uk_companies',
                'get_uk_company_profile',
                'get_uk_company_filings',
                'get_uk_company_accounts',
                'get_ftse100_companies',
                'get_dimensional_facts',
                'build_fact_table',
                'search_facts_by_value',
                'time_series_analysis'
              ],
              description: 'The operation to perform: search_companies (search EU by name via GLEIF), get_company_by_lei (lookup by LEI), get_company_filings (ESEF filings), search_uk_companies (search UK Companies House), get_uk_company_filings (UK filing history), get_uk_company_accounts (UK annual accounts), get_ftse100_companies (major UK companies)',
              examples: ['search_companies', 'search_uk_companies', 'get_uk_company_accounts']
            },
            query: {
              type: 'string',
              description: 'For search_companies: Company name to search for (e.g., "LVMH", "Volkswagen", "TotalEnergies")',
              examples: ['LVMH', 'Volkswagen', 'Siemens', 'TotalEnergies', 'Unilever']
            },
            lei: {
              type: 'string',
              description: 'For get_company_by_lei, get_company_filings: Legal Entity Identifier (LEI) - 20 character alphanumeric code',
              examples: ['529900OKEJD7I0TFO226', '5299000J2N45DDNE4Y28', '969500XXXXXXXXXXXX']
            },
            entity_id: {
              type: 'string',
              description: 'For get_entity_details, get_company_filings: Entity ID from filings.xbrl.org API',
              examples: ['12345', '67890']
            },
            filing_id: {
              type: 'string',
              description: 'For get_filing_facts, get_filing_validation: Filing ID from filings.xbrl.org',
              examples: ['98765', '54321']
            },
            country: {
              type: 'string',
              description: 'For search_companies, get_company_filings, get_country_companies: ISO 3166-1 alpha-2 country code',
              examples: ['FR', 'DE', 'IT', 'ES', 'NL', 'SE', 'BE', 'AT', 'PL', 'FI', 'DK', 'NO', 'IE', 'PT', 'GB']
            },
            start_date: {
              type: 'string',
              description: 'For get_company_filings, filter_filings: Start date for filing period in YYYY-MM-DD format',
              examples: ['2023-01-01', '2024-01-01', '2022-06-01']
            },
            end_date: {
              type: 'string',
              description: 'For get_company_filings, filter_filings: End date for filing period in YYYY-MM-DD format',
              examples: ['2024-12-31', '2023-12-31', '2024-06-30']
            },
            limit: {
              type: 'integer',
              description: 'For search_companies, get_company_filings, get_country_companies, filter_filings: Maximum number of results to return',
              examples: [10, 25, 50, 100]
            },
            filings: {
              type: 'array',
              description: 'For filter_filings: Array of filing objects to filter',
              items: {
                type: 'object'
              }
            },
            max_errors: {
              type: 'integer',
              description: 'For filter_filings: Maximum number of validation errors allowed',
              examples: [0, 5, 10]
            },
            search_criteria: {
              type: 'object',
              description: 'For get_dimensional_facts: Search criteria for dimensional facts',
              properties: {
                concept: {type: 'string'},
                valueRange: {type: 'object'},
                dimensions: {type: 'object'}
              }
            },
            target_value: {
              type: 'number',
              description: 'For build_fact_table, search_facts_by_value: Target value to search around',
              examples: [1000000, 50000000, 100000000]
            },
            tolerance: {
              type: 'number',
              description: 'For build_fact_table, search_facts_by_value: Tolerance range (±)',
              examples: [100000, 5000000, 10000000]
            },
            options: {
              type: 'object',
              description: 'For build_fact_table, time_series_analysis: Analysis options'
            },
            filters: {
              type: 'object',
              description: 'For search_facts_by_value: Additional search filters'
            },
            company_number: {
              type: 'string',
              description: 'For UK methods: UK Companies House company number (8 characters)',
              examples: ['00102498', '03888792', '04366849']
            },
            category: {
              type: 'string',
              description: 'For get_uk_company_filings: Filter by filing category',
              examples: ['accounts', 'confirmation-statement', 'annual-return']
            }
          },
          required: ['method'],
          additionalProperties: false
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'eu-filings') {
    throw new Error(`Unknown tool: ${name}`);
  }

  try {
    const { method, ...params } = args;

    switch (method) {
      case 'search_companies': {
        const { query, country, limit } = params;
        if (!query) {
          throw new Error('query parameter is required for search_companies');
        }

        // All searches now go through GLEIF (1.6M+ EU companies)
        const results = await searchCompanies(query, { country, limit });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_company_by_lei': {
        const { lei } = params;
        if (!lei) {
          throw new Error('lei parameter is required for get_company_by_lei');
        }

        // Try ESEF first, fallback to GLEIF for German companies
        try {
          const result = await getCompanyByLEI(lei);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        } catch (error) {
          // If not found in ESEF, try GLEIF (covers German companies)
          try {
            const germanResult = await getGermanCompanyByLEI(lei);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(germanResult, null, 2)
                }
              ]
            };
          } catch (gleifError) {
            throw error; // Throw original error
          }
        }
      }

      case 'get_company_filings': {
        const { lei, entity_id, start_date, end_date, country, limit } = params;
        const identifier = lei || entity_id;

        if (!identifier) {
          throw new Error('lei or entity_id parameter is required for get_company_filings');
        }

        const results = await getCompanyFilings(identifier, {
          startDate: start_date,
          endDate: end_date,
          country,
          limit
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_country_companies': {
        const { country, limit } = params;
        if (!country) {
          throw new Error('country parameter is required for get_country_companies');
        }

        const results = await getCountryCompanies(country, { limit });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_entity_details': {
        const { entity_id } = params;
        if (!entity_id) {
          throw new Error('entity_id parameter is required for get_entity_details');
        }

        const results = await getEntityDetails(entity_id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_filing_facts': {
        const { filing_id } = params;
        if (!filing_id) {
          throw new Error('filing_id parameter is required for get_filing_facts');
        }

        const results = await getFilingFacts(filing_id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_filing_validation': {
        const { filing_id } = params;
        if (!filing_id) {
          throw new Error('filing_id parameter is required for get_filing_validation');
        }

        const results = await getFilingValidation(filing_id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'filter_filings': {
        const { filings, start_date, end_date, country, max_errors, limit } = params;
        if (!filings || !Array.isArray(filings)) {
          throw new Error('filings array parameter is required for filter_filings');
        }

        const filters = {};
        if (start_date) filters.startDate = start_date;
        if (end_date) filters.endDate = end_date;
        if (country) filters.country = country;
        if (max_errors !== undefined) filters.maxErrors = max_errors;
        if (limit) filters.limit = limit;

        const results = filterFilings(filings, filters);
        const response = {
          originalCount: filings.length,
          filteredCount: results.length,
          filters: filters,
          filings: results,
          source: 'ESEF Filings Filter'
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2)
            }
          ]
        };
      }

      case 'get_dax40_companies': {
        const results = await getDAX40Companies();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'search_swiss_companies': {
        const { query, limit } = params;
        if (!query) {
          throw new Error('query parameter is required for search_swiss_companies');
        }

        const results = await searchSwissCompanies(query, { limit });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_swiss_company_info': {
        const { lei } = params;
        if (!lei) {
          throw new Error('lei parameter is required for get_swiss_company_info');
        }

        const results = await getSwissCompanyInfo(lei);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_six_listed_companies': {
        const results = await getSIXListedCompanies();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      // UK Companies House methods
      case 'search_uk_companies': {
        const { query, limit } = params;
        if (!query) {
          throw new Error('query parameter is required for search_uk_companies');
        }
        const results = await searchUKCompanies(query, { limit });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_uk_company_profile': {
        const { company_number } = params;
        if (!company_number) {
          throw new Error('company_number parameter is required for get_uk_company_profile');
        }
        const results = await getUKCompanyProfile(company_number);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_uk_company_filings': {
        const { company_number, limit, category } = params;
        if (!company_number) {
          throw new Error('company_number parameter is required for get_uk_company_filings');
        }
        const results = await getUKCompanyFilings(company_number, { limit, category });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_uk_company_accounts': {
        const { company_number, limit } = params;
        if (!company_number) {
          throw new Error('company_number parameter is required for get_uk_company_accounts');
        }
        const results = await getUKCompanyAccounts(company_number, { limit });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_ftse100_companies': {
        const results = await getFTSE100Companies();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_dimensional_facts': {
        const { lei, entity_id, filing_id, search_criteria } = params;
        const identifier = lei || entity_id;

        if (!identifier) {
          throw new Error('lei or entity_id parameter is required for get_dimensional_facts');
        }
        if (!filing_id) {
          throw new Error('filing_id parameter is required for get_dimensional_facts');
        }
        if (!search_criteria) {
          throw new Error('search_criteria parameter is required for get_dimensional_facts');
        }

        const results = await getDimensionalFacts(identifier, filing_id, search_criteria);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'build_fact_table': {
        const { lei, entity_id, target_value, tolerance, filing_id, options } = params;
        const identifier = lei || entity_id;

        if (!identifier) {
          throw new Error('lei or entity_id parameter is required for build_fact_table');
        }
        if (target_value === undefined || target_value === null) {
          throw new Error('target_value parameter is required for build_fact_table');
        }

        const results = await buildFactTable(
          identifier,
          target_value,
          tolerance || 50000000,
          filing_id || null,
          options || {}
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'search_facts_by_value': {
        const { lei, entity_id, target_value, tolerance, filters } = params;
        const identifier = lei || entity_id;

        if (!identifier) {
          throw new Error('lei or entity_id parameter is required for search_facts_by_value');
        }
        if (target_value === undefined || target_value === null) {
          throw new Error('target_value parameter is required for search_facts_by_value');
        }

        const results = await searchFactsByValue(
          identifier,
          target_value,
          tolerance || 50000000,
          filters || {}
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'time_series_analysis': {
        const { lei, entity_id, options } = params;
        const identifier = lei || entity_id;

        if (!identifier) {
          throw new Error('lei or entity_id parameter is required for time_series_analysis');
        }

        const results = await timeSeriesAnalysis(identifier, options || {});
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: errorMessage }, null, 2)
        }
      ],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const isSse = process.argv.includes('--sse');

  if (isSse) {
    const app = express();
    const transports = new Map();

    app.get('/sse', async (req, res) => {
      const transport = new SSEServerTransport('/messages', res);
      transports.set(transport.sessionId, transport);
      await server.connect(transport);

      res.on('close', () => {
        transports.delete(transport.sessionId);
      });
    });

    app.post('/messages', async (req, res) => {
      const sessionId = req.query.sessionId;
      const transport = transports.get(sessionId);
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(404).send('Session not found');
      }
    });

    const port = parseInt(process.argv.find(arg => arg.startsWith('--port='))?.split('=')[1] || '8001');
    app.listen(port, () => {
      process.stderr.write(`EU Filings MCP server running on SSE at http://localhost:${port}/sse\n`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write('EU Filings MCP server running on stdio\n');
  }
}

main().catch((error) => {
  process.stderr.write(`Server error: ${error}\n`);
  process.exit(1);
});
