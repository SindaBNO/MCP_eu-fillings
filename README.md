# Unofficial European Financial Filings MCP Server

A Model Context Protocol (MCP) server that provides comprehensive access to European company financial filings via ESEF (European Single Electronic Format). This server enables AI assistants and applications to search, retrieve, and analyze financial statements and XBRL data from 27+ European countries plus Switzerland.

##  Key Features

- **Pan-European Coverage**: Access filings from 27+ EU countries plus UK, Norway, Ukraine, and Switzerland
- **Company Search**: Find companies by name or LEI across all European markets
- **Complete Filing Access**: Retrieve filing histories and document details
- **XBRL Data Extraction**: Parse and analyze IFRS-tagged financial data
- **LEI Integration**: Legal Entity Identifier support with GLEIF fallback
- **Swiss Companies**: Direct access to Swiss company metadata and SIX Exchange blue chips
- **MCP Compatible**: Works seamlessly with Cursor, Claude Desktop, and other MCP clients
- **Real-time Data**: Direct access to filings.xbrl.org database (23,000+ filings)

## What is ESEF?

The European Single Electronic Format (ESEF) is the mandatory electronic reporting format for companies with securities traded on EU regulated markets. Since 2021, all annual financial reports must be prepared in XHTML format with IFRS consolidated financial statements marked up using inline XBRL (iXBRL).

**Data Source**: This server uses the [filings.xbrl.org](https://filings.xbrl.org) API, which provides free public access to ESEF filings across Europe.

## Complete API Reference

The server provides a unified `eu-filings` tool with **16 powerful methods**:

### Company Discovery

#### 1. Search Companies (`search_companies`)
Find companies by name with optional country filtering.

```json
{
  "method": "search_companies",
  "query": "Volkswagen",
  "country": "DE",
  "limit": 10
}
```

**Returns**: List of matching companies with LEI, entity ID, and latest filing info.

#### 2. Get Company by LEI (`get_company_by_lei`)
Look up a specific company using its Legal Entity Identifier.

```json
{
  "method": "get_company_by_lei",
  "lei": "529900D6BF99LW9R2E68"
}
```

**Returns**: Company details including name, LEI, and entity ID.

#### 3. Get Country Companies (`get_country_companies`)
List all companies filing in a specific country.

```json
{
  "method": "get_country_companies",
  "country": "FR",
  "limit": 50
}
```

**Returns**: Companies from the specified country with recent filing data.

### Filing Access

#### 4. Get Company Filings (`get_company_filings`)
Retrieve filing history for a company.

```json
{
  "method": "get_company_filings",
  "lei": "969500XXXXXXXXXXXX",
  "start_date": "2023-01-01",
  "end_date": "2024-12-31",
  "country": "FR",
  "limit": 100
}
```

**Returns**: Array of filings with URLs for package, JSON, XHTML, and viewer formats.

#### 5. Filter Filings (`filter_filings`)
Filter filing arrays by date, country, or validation quality.

```json
{
  "method": "filter_filings",
  "filings": [...],
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "country": "DE",
  "max_errors": 0,
  "limit": 25
}
```

**Returns**: Filtered filing array with counts.

### Data Extraction

#### 6. Get Filing Facts (`get_filing_facts`)
Extract XBRL financial data from a specific filing.

```json
{
  "method": "get_filing_facts",
  "filing_id": "12345"
}
```

**Returns**: XBRL facts in JSON format with period, values, and dimensional context.

#### 7. Get Filing Validation (`get_filing_validation`)
Retrieve validation messages and quality metrics for a filing.

```json
{
  "method": "get_filing_validation",
  "filing_id": "12345"
}
```

**Returns**: Error counts, validation messages with severity and codes.

### Entity Details

#### 8. Get Entity Details (`get_entity_details`)
Get detailed information about a reporting entity.

```json
{
  "method": "get_entity_details",
  "entity_id": "67890"
}
```

**Returns**: Entity name, LEI, and registration details.

### German Companies

#### 9. Get DAX 40 Companies (`get_dax40_companies`)
Get list of major German companies with their LEIs.

```json
{
  "method": "get_dax40_companies"
}
```

**Returns**: List of DAX 40 companies with LEIs, tickers, and Bundesanzeiger links.

**Note on German Filings**: German financial filings are available via Bundesanzeiger but lack a public API. This method provides access to major German companies through GLEIF (Global LEI Foundation). For filing documents, manual access at [bundesanzeiger.de](https://www.bundesanzeiger.de) is required until ESAP launches in 2027.

### Swiss Company Access

#### 10. Search Swiss Companies (`search_swiss_companies`)
Search for Swiss companies using GLEIF API.

```json
{
  "method": "search_swiss_companies",
  "query": "Nestlé",
  "limit": 10
}
```

**Returns**: List of matching Swiss companies with LEI, address, and registration details.

#### 11. Get Swiss Company Info (`get_swiss_company_info`)
Get detailed information about a Swiss company by LEI.

```json
{
  "method": "get_swiss_company_info",
  "lei": "549300U41AUUVOAAOB37"
}
```

**Returns**: Complete company profile including legal form, address, registration number (CHE), and status.

#### 12. Get SIX Listed Companies (`get_six_listed_companies`)
Get curated list of major Swiss companies listed on SIX Swiss Exchange with direct links to financial reports.

```json
{
  "method": "get_six_listed_companies"
}
```

**Returns**: List of top 10 Swiss blue-chip companies (Nestlé, Roche, Novartis, UBS, etc.) with:
- Ticker symbols and ISINs
- LEIs and sector information
- Direct links to investor relations pages
- Annual report URLs
- Market cap estimates

**Note on Swiss Filings**: Switzerland is not an EU member and does not use ESEF. Swiss companies report to SIX Swiss Exchange using Swiss GAAP FER, IFRS, or US-GAAP. This integration provides company metadata and direct links to official investor relations pages for manual report access.

### Advanced Features (Phase 2)

#### 13. Get Dimensional Facts (`get_dimensional_facts`)
Extract XBRL facts with dimensional breakdowns (geography, segments, products).

```json
{
  "method": "get_dimensional_facts",
  "lei": "969500I1EJGUAT223F44",
  "filing_id": "21263",
  "search_criteria": {
    "concept": "Revenue",
    "valueRange": {
      "min": 1000000,
      "max": 100000000
    }
  }
}
```

**Returns**: Facts with dimensional context, geographic and segment breakdowns.

#### 14. Build Fact Table (`build_fact_table`)
Build comprehensive fact table around a target value with business intelligence summaries.

```json
{
  "method": "build_fact_table",
  "lei": "969500I1EJGUAT223F44",
  "target_value": 10000000,
  "tolerance": 5000000,
  "options": {
    "maxRows": 25,
    "sortBy": "deviation"
  }
}
```

**Returns**: Enriched fact table with geographic/segment breakdowns, deviation analysis, and BI summaries.

#### 15. Search Facts by Value (`search_facts_by_value`)
Search for facts across multiple filings by value range.

```json
{
  "method": "search_facts_by_value",
  "lei": "969500I1EJGUAT223F44",
  "target_value": 5000000,
  "tolerance": 2000000
}
```

**Returns**: Facts matching value criteria across all available filings with concept analysis.

#### 16. Time Series Analysis (`time_series_analysis`)
Analyze financial metrics over time with growth rates and trend analysis.

```json
{
  "method": "time_series_analysis",
  "lei": "549300DAQ1CVT6CXN342",
  "options": {
    "concept": "Revenue",
    "periods": 4,
    "includeGeography": true,
    "showGrowthRates": true
  }
}
```

**Returns**: Time-series data with period-over-period growth rates, geographic mix analysis, and trend detection.

## Installation & Setup

### Usage

```json
{
  "mcpServers": {
    "eu-filings": {
      "command": "node",
      "args": ["/path/to/eu-filings-mcp-server/src/index.js"]
    }
  }
}
```

## 🌍 Supported Countries

The server provides access to filings from:

**EU Member States with ESEF Filings**: France (FR), Italy (IT), Spain (ES), Netherlands (NL), Sweden (SE), Finland (FI), and more countries being added as ESEF implementation progresses

**Germany (DE) - Special Support**: German companies accessible via GLEIF/LEI lookup. Major DAX 40 companies available through `get_dax40_companies` method. Filing documents require manual access at Bundesanzeiger.de

**Additional Markets**: United Kingdom (GB), Norway (NO), Ukraine (UA)

**Note**: ESEF implementation timeline varies by country. Some countries have extensive filings available (FR: 1,001, GB: 2,445), while others are still implementing. Use `get_country_companies` to check availability for specific countries.

## 🎯 Real-World Use Cases

### Investment Research
```json
{
  "method": "search_companies",
  "query": "TotalEnergies",
  "country": "FR"
}
```
*Find French energy companies and analyze their financial statements*

### Cross-Border Analysis
```json
{
  "method": "get_country_companies",
  "country": "NL",
  "limit": 100
}
```
*Compare Dutch companies' financial performance*

### German Company Analysis
```json
{
  "method": "get_dax40_companies"
}
```
*Access major German companies (Volkswagen, SAP, Siemens, BMW, etc.) with their LEIs for further lookup*

### Regulatory Compliance
```json
{
  "method": "get_filing_validation",
  "filing_id": "98765"
}
```
*Check filing quality and validation issues*

### Financial Data Extraction
```json
{
  "method": "get_filing_facts",
  "filing_id": "12345"
}
```
*Extract structured XBRL financial data for analysis*

## 📊 IFRS Taxonomy Reference

European filings use the IFRS (International Financial Reporting Standards) taxonomy instead of US-GAAP.

### Common IFRS Concepts

| Concept | Description |
|---------|-------------|
| `Revenue` | Revenue from ordinary activities |
| `Assets` | Total assets |
| `Equity` | Total equity |
| `ProfitLoss` | Profit or loss for the period |
| `CurrentAssets` | Current assets |
| `NoncurrentAssets` | Non-current assets |
| `CurrentLiabilities` | Current liabilities |
| `NoncurrentLiabilities` | Non-current liabilities |

### Dimensional Reporting

ESEF filings include dimensional breakdowns for:
- **Geographic Areas**: Revenue and assets by country/region
- **Business Segments**: Performance by operating segment
- **Products/Services**: Revenue by product line

## Example Queries

### Find a Specific Company
```javascript
// Search by name
{
  "method": "search_companies",
  "query": "Siemens",
  "country": "DE"
}

// Look up by LEI
{
  "method": "get_company_by_lei",
  "lei": "RGzejn5T0C3L19TG2Y71"
}
```

### Get Company Filing History
```javascript
{
  "method": "get_company_filings",
  "lei": "RGZEJN5T0C3L19TG2Y71",
  "start_date": "2023-01-01",
  "end_date": "2024-12-31"
}
```

### Extract Financial Data
```javascript
// Get the filing_id from previous query
{
  "method": "get_filing_facts",
  "filing_id": "54321"
}
```

## Known Limitations

1. **Company Search**: The API doesn't support direct name search, so we search through recent filings. For best results, use LEI when known.
2. **Historical Data**: Only covers filings from 2021 onwards (ESEF mandate start date)
3. **Data Quality**: Varies by country and company; check validation messages
4. **Rate Limits**: Be considerate with API usage (no official limits specified)

## Tips

- **Use LEI for precision**: If you know a company's LEI, use `get_company_by_lei` for fastest results
- **Filter by country**: Narrow searches with country codes for better performance
- **Check validation**: Use `get_filing_validation` to assess data quality
- **Multiple formats available**: Each filing provides package (ZIP), JSON, XHTML, and interactive viewer URLs