# Unofficial European Financial Filings MCP Server

A Model Context Protocol (MCP) server providing access to European company data and financial filings.

## Data Sources

| Source | Coverage | Data |
|--------|----------|------|
| **GLEIF** | 1.6M+ EU companies | Company search, LEI lookup |
| **ESEF (filings.xbrl.org)** | FR, DK, GB, LT, UA | XBRL financial filings |
| **UK Companies House** | 5M+ UK companies | Filing history, annual accounts |
| **Curated Lists** | DAX40, SIX, FTSE100 | Major index companies |

## Usage

```json
{
  "mcpServers": {
    "eu-filings": {
      "command": "node",
      "args": ["/path/to/eu-filings-mcp-server/build/index.js"],
      "env": {
        "UK_COMPANIES_HOUSE_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `UK_COMPANIES_HOUSE_API_KEY` | For UK methods | Free API key from [Companies House](https://developer.company-information.service.gov.uk/) |

## API Methods

### Company Search (GLEIF - All EU)

Search 1.6M+ European companies:

```json
{
  "method": "search_companies",
  "query": "Siemens",
  "country": "DE",
  "limit": 10
}
```

Supported countries: FR, DE, IT, ES, NL, BE, AT, SE, DK, PL, GB, CH, and more.

### Company by LEI

```json
{
  "method": "get_company_by_lei",
  "lei": "YEH5ZCD6E441RHVHD759"
}
```

### ESEF Filings (FR, DK, GB, LT, UA)

Get companies with ESEF filings:

```json
{
  "method": "get_country_companies",
  "country": "FR",
  "limit": 10
}
```

Get filings for a company:

```json
{
  "method": "get_company_filings",
  "lei": "969500YG7U0UQDEHBD60",
  "limit": 5
}
```

Extract XBRL financial data:

```json
{
  "method": "get_filing_facts",
  "filing_id": "23209"
}
```

### UK Companies House

**Requires API key** - Get one free at https://developer.company-information.service.gov.uk/

Search UK companies:

```json
{
  "method": "search_uk_companies",
  "query": "Shell",
  "limit": 10
}
```

Get company profile:

```json
{
  "method": "get_uk_company_profile",
  "company_number": "04366849"
}
```

Get filing history:

```json
{
  "method": "get_uk_company_filings",
  "company_number": "04366849",
  "category": "accounts",
  "limit": 10
}
```

Get annual accounts:

```json
{
  "method": "get_uk_company_accounts",
  "company_number": "04366849",
  "limit": 5
}
```

### Curated Index Lists

DAX 40 (Germany):

```json
{
  "method": "get_dax40_companies"
}
```

FTSE 100 (UK):

```json
{
  "method": "get_ftse100_companies"
}
```

SIX (Switzerland):

```json
{
  "method": "get_six_listed_companies"
}
```

### Swiss Companies

```json
{
  "method": "search_swiss_companies",
  "query": "Nestle",
  "limit": 5
}
```

```json
{
  "method": "get_swiss_company_info",
  "lei": "549300U41AUUVOAAOB37"
}
```

## All Available Methods

| Method | Description | Data Source |
|--------|-------------|-------------|
| `search_companies` | Search companies by name | GLEIF |
| `get_company_by_lei` | Get company by LEI | GLEIF |
| `get_country_companies` | Get companies with ESEF filings | ESEF |
| `get_company_filings` | Get filing history | ESEF |
| `get_entity_details` | Get entity details | ESEF |
| `get_filing_facts` | Extract XBRL data | ESEF |
| `get_filing_validation` | Get validation messages | ESEF |
| `filter_filings` | Filter filing results | ESEF |
| `get_dax40_companies` | DAX 40 companies | Curated |
| `search_swiss_companies` | Search Swiss companies | GLEIF |
| `get_swiss_company_info` | Swiss company details | GLEIF |
| `get_six_listed_companies` | SIX listed companies | Curated |
| `search_uk_companies` | Search UK companies | UK Companies House |
| `get_uk_company_profile` | UK company profile | UK Companies House |
| `get_uk_company_filings` | UK filing history | UK Companies House |
| `get_uk_company_accounts` | UK annual accounts | UK Companies House |
| `get_ftse100_companies` | FTSE 100 companies | Curated |
| `get_dimensional_facts` | Dimensional XBRL facts | ESEF |
| `build_fact_table` | Build fact table | ESEF |
| `search_facts_by_value` | Search facts by value | ESEF |
| `time_series_analysis` | Time series analysis | ESEF |

## Example: Get French Company Financials

```javascript
// 1. Get French companies with filings
{ "method": "get_country_companies", "country": "FR", "limit": 5 }

// 2. Get company details
{ "method": "get_entity_details", "entity_id": "969500YG7U0UQDEHBD60" }

// 3. Get filings
{ "method": "get_company_filings", "lei": "969500YG7U0UQDEHBD60" }

// 4. Extract XBRL financial data
{ "method": "get_filing_facts", "filing_id": "23209" }
```

## Limitations

- **ESEF Filings**: Only available for FR, DK, GB, LT, UA
- **Germany**: No public filing API - use DAX40 list + Bundesanzeiger manual lookup
- **UK**: Requires free API key for Companies House methods
- **Switzerland**: Company metadata only, no XBRL filings (not EU member)

## License

MIT
