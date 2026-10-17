# Executive Org Chart Explorer

Static browser app for viewing a company hierarchy. No Python, Node, or local server is required for normal use.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main chart page (open this) |
| `app.js` | Chart behaviour: pan/zoom, Jump to View, expand/collapse, reset |
| `data.js` | Bundled org data (`window.ORG_DATA`) used on open |
| `packages/` | Offline copies of D3, d3-org-chart, d3-flextree |
| `hr_org.csv` | Source spreadsheet format (optional; for updates) |
| `prepare.html` | Browser tool to rebuild `data.js` from a CSV (no Python) |
| `README.md` | Maintenance note |

**Minimum package for end users:** `index.html` + `app.js` + `data.js` + the whole `packages/` folder  
(No internet required once these files are copied.)

## Runtime libraries (offline)

Scripts are loaded from `packages/` (not from CDN):

| File | Library |
|------|---------|
| `packages/d3.v7.min.js` | D3 v7 |
| `packages/d3-org-chart.min.js` | d3-org-chart v3 |
| `packages/d3-flextree.js` | d3-flextree 2.1.2 |

To refresh a library later, re-download from the original CDN into the same filenames, or ask a developer to update `packages/`.

## Data format

CSV / `ORG_DATA` rows:

| Column | Required | Notes |
|--------|----------|--------|
| `id` | Yes | Unique string id |
| `name` | Yes | Display name |
| `title` | Yes | Role label (directors use `Head of Department` for Jump to View) |
| `parentId` | Yes | Parent’s `id`; empty for the root (CEO) |

Sample hierarchy in the demo: CEO → C-suite → Heads of Department → staff.

## How users open the chart

1. Keep `index.html`, `app.js`, `data.js`, and the `packages/` folder together.
2. Double-click `index.html` — fully offline; no CDN needed.
3. Use **How to use** on the page for business-facing steps.

`file://` cannot reliably `fetch` a sibling CSV; that is why data is bundled in `data.js`.

## Updating org data (no Python)

Preferred path on locked-down laptops:

1. Open `prepare.html` in a browser.
2. Choose the new `hr_org.csv` (or equivalent).
3. Download `data.js`.
4. Replace the existing `data.js` beside `index.html`.
5. Refresh / reopen `index.html`.

Alternative for a one-off session only: on the chart page use **Load CSV**. That does not overwrite `data.js`.

## Chart behaviour (for support)

- **Initial view:** expanded through depth 2 (CEO → VP → director), then fit to screen.
- **Jump to View:** directors (`Head of Department`) and C-suite entries; expands path, highlights, centers.
- **Click node:** expand / collapse subtree (library default).
- **Reset Full View:** restore initial depth and fit overview.

Logic lives in `app.js` (`INITIAL_EXPAND_LEVEL`, `jumpToView`, `resetFullView`).

## Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Blank chart / error about data | Missing `data.js` or wrong folder | Ensure all three core files are together |
| Scripts fail to load | Missing `packages/` folder | Copy `packages/` next to `index.html` |
| Jump list empty / wrong people | Titles do not match filters | Check `title` values; directors should be `Head of Department` |
| Prepare page cannot parse file | Bad CSV | UTF-8 CSV with header `id,name,title,parentId` |
| Orphan / cycle in tree | Bad `parentId` | Validate every `parentId` exists as an `id` (except root) |

## Security / deployment notes

- All processing is client-side; no backend.
- Do not commit real employee data to public repos.
- Treat `data.js` / CSV as confidential HR data.
