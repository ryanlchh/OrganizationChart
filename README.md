# Executive Org Chart Explorer

Static browser app for viewing a company hierarchy. No Python, Node, or local server is required for normal use.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main chart page (open this) |
| `app.js` | Chart behaviour: pan/zoom, Current View, expand/collapse, reset |
| `data.js` | Bundled org data (`window.ORG_DATA`) used on open |
| `packages/` | Offline copies of D3, d3-org-chart, d3-flextree |
| `hr_org.csv` | Sample org file. It includes three invalid people (`Invalid row1`, `Invalid header1`, `Invalid row21`) so Load CSV can show the error table |
| `tests/` | Small CSVs that show prepare checks: bad rows, extra or reordered columns, and a missing column |
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
| `parentId` | Yes | Parent’s `id`, or that person’s `name` after trimming. A unique name is rewritten to the id. A name that matches more than one person is an invalid row. A blank cell, or a value that matches no id and no name, starts another tree |
| `treePriority` | Yes; Optional | `0` is the leftmost tree, then `1`, then `2`. A blank cell inherits the smallest number anywhere in that same tree. A mix such as `0` and `1` is not an error: the tree uses `0` and sits before trees numbered `1` or `2`. A tree with no numbers is placed after the numbered trees, in CSV order |
| `location` | Yes, every person | One of the values in `alias.json` `locationKeys`. The key is the flag file name in `assets` without `.svg` |
| `importance` | Column required; value may be blank | `Y` shows an asterisk before the name |
| `branch` | Optional column; value may be blank | Hiring-company alias from `alias.json` `branchKeys`. A mix is several aliases joined by `/`, such as `HK1/HK2`. A blank cell leaves the card white |
| `function` | Optional column; value may be blank | Function alias from `alias.json` `functionKeys`. A mix is several aliases joined by `/`, such as `Business/Tech`. A blank cell keeps the thin gray border |
| `workstream` | Optional column; value may be blank | Workstream alias from `alias.json` `workstreamKeys`. A mix is several aliases joined by `/`, such as `Retails/Commercials`. A blank cell leaves the branch fill unchanged |
| Project columns | One column per `projectKeys` value | Each value in `projectKeys` is a CSV header, in that order. A cell is `Y` or blank. `Y` fills that project’s dot; a blank cell leaves the same dot light grey |

`data.js` always uses those canonical field names. Market CSV headers can differ. `alias.json` `columnKeys` supplies the real header for each field. Column order does not matter, and spaces around a header are ignored. Extra columns are ignored and are not written into `data.js`. Omit `columnKeys.branch` when the file has no hiring-alias column. Omit `columnKeys.function` when the file has no function column. Omit `columnKeys.workstream` when the file has no workstream column. Project membership is not a `columnKeys` field: each `projectKeys` value is itself the CSV header, and `data.js` stores those flags on `projects` using the `projectKeys` names (`project1`, and so on).

## Alias file

`columnKeys` maps fields to CSV headers. `locationKeys` maps a flag file name (no `.svg`) to the location text stored on each person. `branchKeys` maps an internal name to the hiring-alias text stored in the optional `branch` column. `branchColorKeys` lists card colors in the same order as `branchKeys`: the first branch uses the first color, the second branch the second color, and so on. `functionKeys` and `functionColorKeys` work the same way for the optional `function` column, and those colors are drawn as rings around the card. `workstreamKeys` and `workstreamColorKeys` work the same way for the optional `workstream` column. `projectKeys` lists project column headers in display order. `projectColorKeys` lists dot colors in that same order: the first project uses the first color. Branch and workstream fills are painted at 50% opacity. Project dots use the color as written. When both branch and workstream are set on a person, the card fill is `color-mix(in oklch, branchColor, workstreamColor)` (multi-value cells become a gradient of those mixes). Function rings use the function opacity set in the chart. **Function border** on the chart switches how thick each ring is.

Then open `prepare.html`, choose the CSV, and download a new `data.js`. If a mapped header is not in the file, the page names every missing column and does not offer a download. That check does not depend on column order. Conflicting priority numbers do not stop the download.

Prepare then checks every people row. It does not stop at the first bad person. Invalid rows are listed together under the error message: CSV line, id, name, and reason. One row can have several reasons. A row is invalid when:

| Check | Reason |
|-------|--------|
| `id` is blank | The row has other person fields but no id |
| `id` is repeated | Every row that uses that id |
| `location` is blank or not a `locationKeys` value | Location is required on every person |
| `branch` is set and a `/` part is not a `branchKeys` value | Blank branch cells are allowed |
| `function` is set and a `/` part is not a `functionKeys` value | Blank function cells are allowed |
| `workstream` is set and a `/` part is not a `workstreamKeys` value | Blank workstream cells are allowed |
| A project cell is neither blank nor `Y` | Each `projectKeys` column is `Y` or blank |
| `parentId` is a name shared by more than one person | Use that manager’s id |

**Skip these rows and prepare data.js** drops only those lines, checks what remains, and then enables the download. The ready message includes how many rows were skipped. Completely empty lines are ignored and are not listed.

Two file-level checks still block the download with no skip button. A missing mapped column is one. A missing `projectKeys` header is the same kind of block. The other is `branchColorKeys`, `functionColorKeys`, or `workstreamColorKeys` having fewer colors than the distinct branches, functions, or workstreams left in the file, or `projectColorKeys` having fewer colors than the number of `projectKeys`. Skipping bad people rows does not fix a missing column or a short color list.

When `columnKeys.branch` is set, prepare also checks that column. Each non-blank cell is split on `/`. Every part must be a `branchKeys` value. The number of colors in `branchColorKeys` must be at least the number of distinct branches in the file. Three branches and three colors passes; three branches and two colors fails. People with a branch are filled with those colors at 50% opacity: one alias is a solid tint, two aliases split the card in half, three aliases take about a third each.

When `columnKeys.function` is set, prepare checks that column the same way against `functionKeys` and `functionColorKeys`. A person with a function gets a ring in that color. A mix such as `Business/Tech` adds one ring per function. The first function is the outer ring. The card’s outer size stays the same. **Slice** gives every function its own ring at `SLICE_PX` (8px), so two functions are 16px thick and three are 24px. **Stack** uses the same rings at `STACK_PX` (4px) per function. A blank cell keeps the thin gray border. The choice is remembered in the browser.

When `columnKeys.workstream` is set, prepare checks that column the same way against `workstreamKeys` and `workstreamColorKeys`. A person with only a workstream gets that tint as the card fill. A person with both branch and workstream gets the OKLCH mix of those colors. Neither set leaves the card white (as before).

Each `projectKeys` entry adds a required CSV column. The cell must be `Y` or blank. `projectColorKeys` must contain at least as many colors as there are project keys, whether or not anyone is marked `Y`. On the card, dots sit in `projectKeys` order under the role. `Y` fills that dot with the matching project color. Anything else in the sequence stays light grey and still visible.

Downloading `data.js` also saves the alias that was used (`window.ALIAS`). The chart needs that copy: double-clicking `index.html` cannot read `alias.json`. Change `alias.json`, then download `data.js` again, before the legend names and card colors update offline. The legend puts base `branchKeys`, `functionKeys`, `workstreamKeys`, and `projectKeys` on the first line as separate labelled grey boxes (`branch`, `function`, `workstream`, `project`), then starts `${branch} ${workstream}` mix dots on the next line for combinations that appear in the loaded data (max 9 mix items per line). Click a legend to fade people who do not match: the card opacity drops to 5% and the name turns grey. Reporting lines stay visible. Click the legend again to clear. **Multi-select** lets several legends stay on at once, and a person matches if any selected legend applies. Unselected legends dim while a filter is active. Loading a new CSV clears the selection.

## How users open the chart

1. Keep `index.html`, `app.js`, `data.js`, and the `packages/` folder together.
2. Double-click `index.html` — fully offline; no CDN needed.
3. Use **Help Guide** on the page for business-facing steps.

`file://` cannot reliably `fetch` a sibling CSV or `alias.json`; that is why both the rows and the alias are bundled in `data.js`.

## Updating org data (no Python)

Preferred path on locked-down laptops:

1. Open `prepare.html` in a browser. It reads `alias.json` from the same folder. If that is blocked, use **Mapping JSON** and pick `alias.json`.
2. Choose the new CSV (header names must match `columnKeys`; order and extra columns do not matter).
3. If the error table lists people rows, fix the CSV or click **Skip these rows and prepare data.js**. Then download `data.js`.
4. Replace the existing `data.js` beside `index.html`.
5. Refresh / reopen `index.html`.

Alternative for a one-off session only: on the chart page use the folder icon (**Load CSV**). That does not overwrite `data.js`. It uses the same row checks as prepare. Invalid people are listed in a table with the line, id, name, and reason. **Continue** loads the chart without those rows. **Cancel** leaves the chart that is already open. A missing column, or too few branch or function colors, still blocks the load with no Continue button. `hr_org.csv` is the file to try: it lists `Invalid row1`, `Invalid header1`, and `Invalid row21`.

## Sample files for prepare

Open `prepare.html` and choose one of these. They use the `alias.json` in this folder.

| File | What it shows | What prepare should do |
|------|----------------|------------------------|
| `tests/invalid-rows.csv` | Blank id, duplicate id, bad location, bad branch, bad function, and a parent name that matches two people. Includes `Invalid row1` (blank location), `Invalid header1` (`function` is `undefined`), and `Invalid row21` (location `UK1`) | Lists 9 rows. **Skip these rows and prepare data.js** leaves Sarah Jenkins (`1`) and the second Alex Rivera (`3`) |
| `tests/extra-columns-reordered.csv` | Sarah Jenkins and Alex Rivera, with headers out of order, spaces around `tree_priority`, and extra columns `notes`, `cost center` (values contain commas), and `region code` | No error table. Two people, parent `Sarah Jenkins` rewritten to id `1`. Extra columns are not in `data.js` |
| `tests/missing-column.csv` | Headers `id`, `name`, and `title` only | Names each missing mapped column. No error table and no skip button |

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
| Prepare page reports a missing column | Header text does not match `alias.json` `columnKeys` | Fix the CSV header or the mapped name, then choose the file again. Try `tests/missing-column.csv` |
| Prepare lists people in a red table | Those rows fail a row check (id, location, branch, function, or an ambiguous parent name) | Fix the CSV, or click **Skip these rows and prepare data.js**. Try `tests/invalid-rows.csv` |
| Prepare says there are not enough colors | `branchColorKeys`, `functionColorKeys`, or `workstreamColorKeys` is shorter than the distinct values still in the file, or `projectColorKeys` is shorter than `projectKeys` | Add colors, or remove a key. Skip does not apply |
| Several separate trees | Some `parentId` values are blank, or match neither an id nor a unique name | Expected. Trees are ordered by `treePriority` |
| Load CSV lists people in a table | Those rows fail a row check | **Continue** loads the rest. **Cancel** keeps the current chart. `hr_org.csv` lists three invalid people |

## Security / deployment notes

- All processing is client-side; no backend.
- Do not commit real employee data to public repos.
- Treat `data.js` / CSV as confidential HR data.
