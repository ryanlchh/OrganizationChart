# Executive Org Chart Explorer

Static browser app for viewing a company hierarchy. No Python, Node, or local server is required for normal use.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main chart page (open this) |
| `app.js` | Chart behaviour: pan/zoom, Current View, expand/collapse, reset |
| `data.js` | Bundled org data (`window.ORG_DATA`) used on open |
| `packages/` | Offline copies of D3, d3-org-chart, d3-flextree |
| `hr_org.csv` | Sample org file (optional; for updates) |
| `alias.json` | Column header names and location-to-flag names |
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
| `title` | Yes | Role label (directors use `Head of Department` for Current View) |
| `parentId` | Yes | Parent’s `id`, or that person’s `name` after trimming. A unique name is rewritten to the id. A name that matches more than one person stops the load so the id can be entered by hand. A blank cell, or a value that matches no id and no name, starts another tree |
| `treePriority` | Yes; Optional | `0` is the leftmost tree, then `1`, then `2`. A blank cell inherits the smallest number anywhere in that same tree. A mix such as `0` and `1` is not an error: the tree uses `0` and sits before trees numbered `1` or `2`. A tree with no numbers is placed after the numbered trees, in CSV order |
| `location` | Yes, every person | One of the values in `alias.json` `locationKeys`. The key is the flag file name in `assets` without `.svg` |
| `importance` | Column required; value may be blank | `Y` shows an asterisk before the name |
| `branch` | Optional column; value may be blank | Hiring-company alias from `alias.json` `branchKeys`. A mix is several aliases joined by `/`, such as `HK1/HK2`. A blank cell leaves the card white |
| `function` | Optional column; value may be blank | Function alias from `alias.json` `functionKeys`. A mix is several aliases joined by `/`, such as `Business/Tech`. A blank cell keeps the thin gray border |

`data.js` always uses those canonical field names. Market CSV headers can differ. `alias.json` `columnKeys` supplies the real header for each field. Column order does not matter. Omit `columnKeys.branch` when the file has no hiring-alias column. Omit `columnKeys.function` when the file has no function column.

## Alias file

`columnKeys` maps fields to CSV headers. `locationKeys` maps a flag file name (no `.svg`) to the location text stored on each person. `branchKeys` maps an internal name to the hiring-alias text stored in the optional `branch` column. `branchColorKeys` lists card colors in the same order as `branchKeys`: the first branch uses the first color, the second branch the second color, and so on. `functionKeys` and `functionColorKeys` work the same way for the optional `function` column, and those colors are drawn as rings around the card. Branch fills are painted at 50% opacity. Function rings use the function opacity set in the chart. **Function border** on the chart switches how thick each ring is.

Then open `prepare.html`, choose the CSV, and download a new `data.js`. If a mapped header is not in the file, the page stops and names the missing column. Conflicting priority numbers do not stop the download.

When `columnKeys.branch` is set, prepare also checks that column. Each non-blank cell is split on `/`. Every part must be a `branchKeys` value. The number of colors in `branchColorKeys` must be at least the number of distinct branches in the file. Three branches and three colors passes; three branches and two colors fails. People with a branch are filled with those colors at 50% opacity: one alias is a solid tint, two aliases split the card in half, three aliases take about a third each.

When `columnKeys.function` is set, prepare checks that column the same way against `functionKeys` and `functionColorKeys`. A person with a function gets a ring in that color. A mix such as `Business/Tech` adds one ring per function. The first function is the outer ring. The card’s outer size stays the same. **Slice** gives every function its own ring at `SLICE_PX` (8px), so two functions are 16px thick and three are 24px. **Stack** uses the same rings at `STACK_PX` (4px) per function. A blank cell keeps the thin gray border. The choice is remembered in the browser.

Downloading `data.js` also saves the alias that was used (`window.ALIAS`). The chart needs that copy: double-clicking `index.html` cannot read `alias.json`. Change `alias.json`, then download `data.js` again, before the legend names and card colors update offline. The legend prints each `branchKeys` and `functionKeys` value, in the same order as the color lists.

## How users open the chart

1. Keep `index.html`, `app.js`, `data.js`, and the `packages/` folder together.
2. Double-click `index.html` — fully offline; no CDN needed.
3. Use **Help Guide** on the page for business-facing steps.

`file://` cannot reliably `fetch` a sibling CSV or `alias.json`; that is why both the rows and the alias are bundled in `data.js`.

## Updating org data (no Python)

Preferred path on locked-down laptops:

1. Open `prepare.html` in a browser. It reads `alias.json` from the same folder. If that is blocked, use **Mapping JSON** and pick `alias.json`.
2. Choose the new CSV (headers must match `columnKeys`).
3. Download `data.js`.
4. Replace the existing `data.js` beside `index.html`.
5. Refresh / reopen `index.html`.

Alternative for a one-off session only: on the chart page use **Load CSV**. That does not overwrite `data.js`.

## Chart behaviour (for support)

- **Initial view:** expanded through depth 2 (CEO → VP → director), then fit to screen.
- **Current View:** directors (`Head of Department`) and C-suite entries; expands path, highlights, centers.
- **Click node:** expand / collapse subtree (library default).
- **Reset Full View:** restore initial depth and fit overview.

Logic lives in `app.js` (`INITIAL_EXPAND_LEVEL`, `jumpToView`, `resetFullView`).

## Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Blank chart / error about data | Missing `data.js` or wrong folder | Ensure all three core files are together |
| Scripts fail to load | Missing `packages/` folder | Copy `packages/` next to `index.html` |
| Jump list empty / wrong people | Titles do not match filters | Check `title` values; directors should be `Head of Department` |
| Prepare page reports a missing column | Header text does not match `alias.json` `columnKeys` | Fix the CSV header or the mapped name, then choose the file again |
| Several separate trees | Some `parentId` values are blank, or match neither an id nor a unique name | Expected. Trees are ordered by `treePriority` |
| Prepare or chart stops on a parent name | That name belongs to more than one person | Put the manager’s `id` in `parentId` |

## Security / deployment notes

- All processing is client-side; no backend.
- Do not commit real employee data to public repos.
- Treat `data.js` / CSV as confidential HR data.
