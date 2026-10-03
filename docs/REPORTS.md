# Reports

`/reports` offers Standard (two selections), One Pager (two), and Comparison
(five) reports. Creation follows type → template → portfolio/fund → details →
full-screen builder. The chooser uses the supplied 806 × 321 desktop reference;
the builder has a 283px page rail, Pages/Details/Style tabs, landscape preview,
Edit Page, Save as Template and a Save Report export menu. Colors, panels and
controls inherit Luna's active theme.

## Working controls

- Blank, Overview Summary Report and Client Proposal starting templates; saved
  templates are reusable by report type.
- ETF/mutual-fund search and model/client portfolio selection, custom display
  names, report title, client, prepared by and date range.
- Page selection, keyboard-accessible up/down ordering, drag ordering, visibility,
  custom page removal, continuation-page navigation and live data refresh.
- Edit Page changes headings, exhibits, available table columns, key statistics,
  top holding count, fee and cash sensitivity inputs, and editorial content.
- Editorial image/text layouts, team biographies, feature cards and market
  graph layouts. Graphs accept market tickers/indices, not economic-series IDs.
- Cover design, brand color and logo. JPEG/PNG/SVG inputs are limited to 1 MB.
  SVG logos are sanitized and flattened locally before storage and PDF export.
- Save, reopen, duplicate, search, filter, sort, template reuse, CSV and PDF
  exports. Save and Export performs both actions and surfaces failures.
- New Chat documents can be opened as editable editorial report pages. Imported
  tables and long text continue across PDF pages rather than losing rows.

## Storage and data

Signed-in records use the account-scoped `AdvisorItem` API with revisions.
Signed-out records remain in the browser. Older browser records require an
explicit import into the account. The migration and connection prerequisites
are documented in `ACCOUNT_CHAT.md`; no infrastructure is provisioned by this
feature. If account storage is unavailable, designing and exporting a draft
still works, while account save errors remain visible.

The builder captures an actual data snapshot from existing holdings, stock
profile and daily chart APIs. Saved reports retain that snapshot until refreshed.
The SVG preview and vector PDF share `reportLayout.mjs` so page order, tables,
charts, image placement and brand color agree. CSV contains the holdings data,
or an imported editorial table/text when no financial snapshot exists.

Portfolio performance is a hypothetical buy-and-hold price-return calculation,
not the client's historical account balance. All required constituent price
series must be present; missing allocations are never silently dropped. Risk
uses daily price returns. Data requests are bounded to four concurrent calls,
60 performance securities, 30 constituent profiles and ten market graph tickers.

This is an implementation of the reference workflow, not full Koyfin data-feed
parity. Fund holdings may be partial. Fund fees, fixed-income styleboxes, bond
duration/credit quality and risk-free-rate ratios are unavailable with the
current feeds and are labeled accordingly. Stock X-Ray currently shows direct
holdings/overlap rather than recursively resolving funds. Market graphs use
indexed closing-price series. Upstream outages produce unavailable values.

## Verification

Run `node --test lib/reports.test.mjs lib/accountWorkspace.test.mjs`, scoped
ESLint and `npm run build`. Browser checks cover the creation wizard, page
controls, template save/reuse, reopening, export and desktop/mobile layouts.
Inspect rendered PDFs in addition to checking their page count.
