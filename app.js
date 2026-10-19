(() => {
  const INITIAL_EXPAND_LEVEL = 2; // CEO(0) → VP(1) → Director(2)
  const FOREST_ID = "__all_trees__";
  const CSV_URL = "./hr_org.csv";
  const LEGEND_PER_LINE = 9;
  const FUNCTION_MARK_DEFAULT = "stack"; // or "slice"
  const FUNCTION_OPACITY = 0.5;
  const BRANCH_OPACITY = 0.5;
  const WORKSTREAM_OPACITY = 0.5;
  const SLICE_PX = 8;
  const STACK_PX = 4;
  const CARD_RADIUS = 8;
  const FALLBACK_ALIAS = {
    columnKeys: {
      id: "id",
      name: "name",
      title: "title",
      parentId: "parentId",
      treePriority: "tree_priority",
      location: "location",
      importance: "importance",
      branch: "branch",
      function: "function",
      workstream: "workstream",
    },
    locationKeys: {
      hk: "HK",
      in: "India",
      cn: "Mainland China",
      pl: "Poland",
      gb: "UK",
      us: "US",
    },
    branchKeys: {
      branch1: "branch1",
      branch2: "branch2",
      branch3: "branch3",
    },
    branchColorKeys: {
      color1: "#FF7F7F",
      color2: "#98FB98",
      color3: "#87CEFA",
      color4: "#D8BFD8",
    },
    functionKeys: {
      function1: "function1",
      function2: "function2",
      function3: "function3",
    },
    functionColorKeys: {
      color1: "#C2410C",
      color2: "#1D4ED8",
      color3: "#15803D",
      color4: "#7E22CE",
    },
    workstreamKeys: {
      workRetails: "Retails",
      workCommercials: "Commercials",
      workInvestments: "Investments",
    },
    workstreamColorKeys: {
      color1: "grey",
      color2: "blue",
      color3: "yellow",
    },
    projectKeys: {
      project1: "Project 1",
      project2: "Project 2",
      project3: "Project 3",
      project4: "Project 4",
    },
    projectColorKeys: {
      color1: "blue",
      color2: "pink",
      color3: "yellow",
      color4: "green",
    },
  };

  let chart = null;
  let rawData = [];
  let functionMark = FUNCTION_MARK_DEFAULT;
  let pendingLoad = null;
  let legendMulti = false;
  let legendAutoExpand = false;
  let legendSelected = [];

  const statusEl = document.getElementById("status");
  const statusText = document.getElementById("statusText");
  const rowErrors = document.getElementById("rowErrors");
  const rowErrorBody = document.getElementById("rowErrorBody");
  const skipRowsBtn = document.getElementById("skipRowsBtn");
  const cancelRowsBtn = document.getElementById("cancelRowsBtn");
  const directorSelect = document.getElementById("directorSelect");
  const functionMarkSelect = document.getElementById("functionMark");
  const resetBtn = document.getElementById("resetBtn");
  const csvInput = document.getElementById("csvInput");
  const sourceNameEl = document.getElementById("sourceName");
  const searchForm = document.getElementById("searchForm");
  const personSearch = document.getElementById("personSearch");
  const searchResults = document.getElementById("searchResults");

  function hideRowPrompt() {
    if (!rowErrors) return;
    rowErrors.hidden = true;
    rowErrorBody.replaceChildren();
    statusEl.classList.remove("has-table");
  }

  function showStatus(message, isError = false) {
    hideRowPrompt();
    pendingLoad = null;
    statusText.textContent = message;
    statusEl.classList.toggle("error", isError);
    statusEl.classList.add("visible");
  }

  function hideStatus() {
    hideRowPrompt();
    pendingLoad = null;
    statusEl.classList.remove("visible", "error");
    statusText.textContent = "";
  }

  function showRowPrompt(problems) {
    statusText.textContent = problems.length + (problems.length === 1 ? " row" : " rows") +
      " cannot be used. Continue to load the chart without them, or cancel.";
    rowErrorBody.replaceChildren();
    problems.forEach((problem) => {
      const tr = document.createElement("tr");
      [String(problem.line), problem.id || "(blank)", problem.name || "(blank)", problem.reasons.join("; ")].forEach((text) => {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      });
      rowErrorBody.appendChild(tr);
    });
    rowErrors.hidden = false;
    statusEl.classList.add("visible", "error", "has-table");
  }

  function setSourceName(name) {
    if (!sourceNameEl) return;
    sourceNameEl.textContent = String(name || "").trim();
  }

  function normalizeRows(rows) {
    return rows
      .filter((d) => d.id != null && String(d.id).trim() !== "")
      .map((d) => {
        const parentId = d.parentId == null ? "" : String(d.parentId).trim();
        return {
          id: String(d.id).trim(),
          name: String(d.name || "").trim(),
          title: String(d.title || "").trim(),
          parentId: parentId === "" || parentId.toLowerCase() === "null" ? "" : parentId,
          treePriority: String(d.treePriority != null ? d.treePriority : (d.tree_priority || "")).trim(),
          location: String(d.location || "").trim(),
          importance: String(d.importance || "").trim(),
          branch: String(d.branch || "").trim(),
          function: String(d.function || "").trim(),
          workstream: String(d.workstream || "").trim(),
          projects: normalizeProjects(d.projects),
        };
      });
  }

  function resolveParentNames(rows) {
    const ids = new Set(rows.map((row) => row.id));
    const idsByName = new Map();
    rows.forEach((row) => {
      const name = row.name.trim();
      if (!name) return;
      if (!idsByName.has(name)) idsByName.set(name, []);
      idsByName.get(name).push(row.id);
    });
    for (const row of rows) {
      const parent = row.parentId.trim();
      if (!parent || ids.has(parent)) continue;
      const matches = idsByName.get(parent) || [];
      if (matches.length === 1) {
        row.parentId = matches[0];
      } else if (matches.length > 1) {
        return (
          'Parent name "' + parent + '" on person ' + row.id +
          " matches more than one person (" + matches.join(", ") +
          "). Put that manager's id in parentId."
        );
      }
    }
    return "";
  }

  function activeColumnMap() {
    const source = (window.ALIAS && window.ALIAS.columnKeys) || {};
    const map = {};
    ["id", "name", "title", "parentId", "treePriority", "location", "importance"].forEach((key) => {
      map[key] = String(source[key] == null ? "" : source[key]).trim();
    });
    if (String(source.branch || "").trim()) map.branch = String(source.branch).trim();
    if (String(source.function || "").trim()) map.function = String(source.function).trim();
    if (String(source.workstream || "").trim()) map.workstream = String(source.workstream).trim();
    map.projects = projectColumns();
    return map;
  }

  function projectColumns() {
    const keys = (window.ALIAS && window.ALIAS.projectKeys) || {};
    return Object.entries(keys)
      .map(([key, header]) => ({
        key: String(key),
        header: String(header == null ? "" : header).trim(),
      }))
      .filter((item) => item.header);
  }

  function normalizeProjects(value) {
    const source = value && typeof value === "object" ? value : {};
    const flags = {};
    projectColumns().forEach((col) => {
      const raw = source[col.key] != null ? source[col.key] : source[col.header];
      flags[col.key] = String(raw || "").trim().toUpperCase() === "Y" ? "Y" : "";
    });
    return flags;
  }

  function projectsAreBlank(projects) {
    return Object.values(projects || {}).every((value) => !String(value || "").trim());
  }

  function csvCell(row, header) {
    if (!header) return "";
    if (Object.prototype.hasOwnProperty.call(row, header)) return row[header];
    const key = Object.keys(row).find((name) => String(name).trim() === header);
    return key ? row[key] : "";
  }

  function blankToEmpty(value) {
    const text = String(value || "").trim();
    return text.toLowerCase() === "null" ? "" : text;
  }

  function mapCsvRecord(record, map) {
    const data = record.data;
    const row = {
      _line: record.line,
      id: String(csvCell(data, map.id) || "").trim(),
      name: String(csvCell(data, map.name) || "").trim(),
      title: String(csvCell(data, map.title) || "").trim(),
      parentId: blankToEmpty(csvCell(data, map.parentId)),
      treePriority: blankToEmpty(csvCell(data, map.treePriority)),
      location: blankToEmpty(csvCell(data, map.location)),
      importance: blankToEmpty(csvCell(data, map.importance)),
    };
    if (map.branch) row.branch = blankToEmpty(csvCell(data, map.branch));
    if (map.function) row.function = blankToEmpty(csvCell(data, map.function));
    if (map.workstream) row.workstream = blankToEmpty(csvCell(data, map.workstream));
    row.projects = {};
    (map.projects || []).forEach((col) => {
      row.projects[col.key] = blankToEmpty(csvCell(data, col.header));
    });
    return row;
  }

  function isBlankPerson(row) {
    return !row.id && !row.name && !row.title && !row.parentId &&
      !row.treePriority && !row.location && !row.importance &&
      !row.branch && !row.function && !row.workstream &&
      projectsAreBlank(row.projects);
  }

  function tokenReason(raw, allowedSet, allowedList, fieldLabel) {
    if (!raw) return "";
    const bad = [];
    raw.split("/").forEach((token) => {
      const label = token.trim();
      if (!label || !allowedSet.has(label)) bad.push(label || "(blank)");
    });
    if (!bad.length) return "";
    const known = allowedList.length ? ": " + allowedList.join(", ") : "";
    return fieldLabel + ' "' + raw + '" has ' + bad.map((part) => '"' + part + '"').join(", ") +
      ", which must be a " + fieldLabel + "Keys value" + known + ".";
  }

  function distinctLabels(rows, field, allowedSet) {
    const seen = new Set();
    rows.forEach((row) => {
      String(row[field] || "").split("/").forEach((token) => {
        const label = token.trim();
        if (label && allowedSet.has(label)) seen.add(label);
      });
    });
    return seen;
  }

  function colorCountReason(rows, field, keysName, colorName) {
    const allowed = Object.values((window.ALIAS && window.ALIAS[keysName]) || {});
    const seen = distinctLabels(rows, field, new Set(allowed));
    const colorCount = Object.keys((window.ALIAS && window.ALIAS[colorName]) || {}).length;
    if (colorCount >= seen.size) return "";
    const plurals = {
      branch: { one: "branch", many: "branches", group: "branches" },
      function: { one: "function", many: "functions", group: "functions" },
      workstream: { one: "workstream", many: "workstreams", group: "workstreams" },
    };
    const words = plurals[field] || { one: field, many: field + "s", group: field + "s" };
    const plural = seen.size === 1 ? words.one : words.many;
    return colorName + " has " + colorCount + " color" + (colorCount === 1 ? "" : "s") +
      " but the " + field + " column has " + seen.size + " distinct " + plural +
      ". Need at least as many colors as " + words.group + ".";
  }

  function projectColorCountReason() {
    const keyCount = projectColumns().length;
    if (!keyCount) return "";
    const colorCount = Object.keys((window.ALIAS && window.ALIAS.projectColorKeys) || {}).length;
    if (colorCount >= keyCount) return "";
    const plural = keyCount === 1 ? "project" : "projects";
    return "projectColorKeys has " + colorCount + " color" + (colorCount === 1 ? "" : "s") +
      " but projectKeys has " + keyCount + " " + plural +
      ". Need at least as many colors as projects.";
  }

  function rowProblems(rows, map) {
    const idCounts = new Map();
    rows.forEach((row) => {
      if (!row.id) return;
      idCounts.set(row.id, (idCounts.get(row.id) || 0) + 1);
    });
    const ids = new Set(rows.filter((row) => row.id).map((row) => row.id));
    const idsByName = new Map();
    rows.forEach((row) => {
      if (!row.id || !row.name) return;
      if (!idsByName.has(row.name)) idsByName.set(row.name, []);
      idsByName.get(row.name).push(row.id);
    });
    const allowedLocations = new Set(Object.values((window.ALIAS && window.ALIAS.locationKeys) || {}));
    const knownLocations = Array.from(allowedLocations);
    const allowedBranches = Object.values((window.ALIAS && window.ALIAS.branchKeys) || {});
    const allowedFunctions = Object.values((window.ALIAS && window.ALIAS.functionKeys) || {});
    const allowedWorkstreams = Object.values((window.ALIAS && window.ALIAS.workstreamKeys) || {});

    return rows.map((row) => {
      const reasons = [];
      if (!row.id) reasons.push("id is blank.");
      else if (idCounts.get(row.id) > 1) reasons.push('id "' + row.id + '" is used by more than one row.');
      if (!row.location || !allowedLocations.has(row.location)) {
        reasons.push(
          'location "' + (row.location || "") + '" is not in locationKeys' +
          (knownLocations.length ? ": " + knownLocations.join(", ") : "") + "."
        );
      }
      if (map.branch) {
        const branchReason = tokenReason(row.branch, new Set(allowedBranches), allowedBranches, "branch");
        if (branchReason) reasons.push(branchReason);
      }
      if (map.function) {
        const functionReason = tokenReason(row.function, new Set(allowedFunctions), allowedFunctions, "function");
        if (functionReason) reasons.push(functionReason);
      }
      if (map.workstream) {
        const workstreamReason = tokenReason(
          row.workstream,
          new Set(allowedWorkstreams),
          allowedWorkstreams,
          "workstream"
        );
        if (workstreamReason) reasons.push(workstreamReason);
      }
      (map.projects || []).forEach((col) => {
        const raw = String((row.projects && row.projects[col.key]) || "").trim();
        if (raw && raw.toUpperCase() !== "Y") {
          reasons.push('project "' + col.header + '" is "' + raw + '", which must be Y or blank.');
        }
      });
      const parent = row.parentId.trim();
      if (parent && !ids.has(parent)) {
        const matches = idsByName.get(parent) || [];
        if (matches.length > 1) {
          reasons.push(
            'parentId "' + parent + '" matches more than one person (' + matches.join(", ") +
            "). Use that manager's id."
          );
        }
      }
      return reasons.length ? { line: row._line, id: row.id, name: row.name, reasons: reasons } : null;
    }).filter(Boolean);
  }

  function chartRows(rows) {
    return rows.map((row) => {
      const copy = {
        id: row.id,
        name: row.name,
        title: row.title,
        parentId: row.parentId,
        treePriority: row.treePriority,
        location: row.location,
        importance: row.importance,
        branch: row.branch || "",
        function: row.function || "",
        workstream: row.workstream || "",
        projects: normalizeProjects(row.projects),
      };
      return copy;
    });
  }

  function finishCsvLoad(rows, sourceName, skipped) {
    const people = chartRows(rows);
    const parentError = resolveParentNames(people);
    if (parentError) {
      showStatus(parentError, true);
      return;
    }
    setSourceName(sourceName);
    buildChart(people, { keepStatus: true });
    if (skipped) {
      showStatus("Skipped " + skipped + " invalid " + (skipped === 1 ? "row. " : "rows. ") + people.length + " people loaded.");
    } else {
      hideStatus();
    }
  }

  function priorityNumber(value) {
    if (value == null) return null;
    const text = String(value).trim();
    if (!text || text.toLowerCase() === "null") return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function withForest(rows) {
    const ids = new Set(rows.map((row) => row.id));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const order = new Map(rows.map((row, index) => [row.id, index]));

    function parentIdOf(row) {
      return row.parentId && ids.has(row.parentId) ? row.parentId : "";
    }

    const rootOf = new Map();
    function findRoot(id, stack) {
      if (rootOf.has(id)) return rootOf.get(id);
      if (stack.has(id)) return id;
      stack.add(id);
      const parentId = parentIdOf(byId.get(id));
      const root = parentId ? findRoot(parentId, stack) : id;
      stack.delete(id);
      rootOf.set(id, root);
      return root;
    }
    rows.forEach((row) => findRoot(row.id, new Set()));

    const trees = new Map();
    rows.forEach((row) => {
      const root = rootOf.get(row.id);
      if (!trees.has(root)) trees.set(root, []);
      trees.get(root).push(row);
    });

    const ranked = [];
    trees.forEach((members, rootId) => {
      let best = null;
      members.forEach((member) => {
        const number = priorityNumber(member.treePriority);
        if (number == null) return;
        if (best == null || number < best) best = number;
      });
      ranked.push({ rootId, best, index: order.get(rootId) });
    });
    ranked.sort((a, b) => {
      if (a.best == null && b.best == null) return a.index - b.index;
      if (a.best == null) return 1;
      if (b.best == null) return -1;
      if (a.best !== b.best) return a.best - b.best;
      return a.index - b.index;
    });

    if (ranked.length <= 1) {
      return rows.map((row) => ({ ...row, parentId: parentIdOf(row) }));
    }

    const laidOut = [{
      id: FOREST_ID,
      name: "",
      title: "",
      parentId: "",
      treePriority: "",
    }];
    ranked.forEach(({ rootId }) => {
      const members = trees.get(rootId).slice().sort((a, b) => order.get(a.id) - order.get(b.id));
      const rootRow = members.find((row) => row.id === rootId);
      const rest = members.filter((row) => row.id !== rootId);
      [rootRow, ...rest].forEach((row) => {
        if (!row) return;
        const parentId = parentIdOf(row);
        laidOut.push({ ...row, parentId: parentId || FOREST_ID });
      });
    });
    return laidOut;
  }

  function populateDirectorDropdown(data) {
    directorSelect.innerHTML = '<option value="">-- Select a Director / Branch --</option>';

    const directors = data.filter(
      (d) => d.id !== FOREST_ID && (d.title === "Head of Department" || /chief/i.test(d.title))
    );

    // Prefer department heads first, then C-suite (excluding CEO)
    directors
      .sort((a, b) => {
        const aDir = a.title === "Head of Department" ? 0 : 1;
        const bDir = b.title === "Head of Department" ? 0 : 1;
        if (aDir !== bDir) return aDir - bDir;
        return a.name.localeCompare(b.name);
      })
      .forEach((d) => {
        if (d.title === "Chief Executive Officer") return;
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = `${d.name} (${d.title})`;
        directorSelect.appendChild(opt);
      });
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function withOpacity(color, alpha) {
    const raw = String(color || "").trim();
    if (!raw) return raw;
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
    }
    const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i.exec(raw);
    if (rgb) {
      return "rgba(" + rgb[1] + ", " + rgb[2] + ", " + rgb[3] + ", " + alpha + ")";
    }
    return raw;
  }

  function splitTokens(value) {
    return String(value || "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function keyColorEntries(value, keysName, colorName, opacity) {
    const tokens = splitTokens(value);
    if (!tokens.length) return [];
    const names = Object.values((window.ALIAS && window.ALIAS[keysName]) || {});
    const colors = Object.values((window.ALIAS && window.ALIAS[colorName]) || {});
    const picked = [];
    for (const token of tokens) {
      const index = names.indexOf(token);
      if (index < 0 || !colors[index]) return null;
      const solid = String(colors[index]).trim();
      picked.push({
        name: token,
        color: opacity < 1 ? withOpacity(solid, opacity) : solid,
      });
    }
    return picked;
  }

  function gradientFill(colors) {
    if (!colors.length) return "#fff";
    if (colors.length === 1) return colors[0];
    const stops = colors.map((color, index) => {
      const start = (100 * index) / colors.length;
      const end = (100 * (index + 1)) / colors.length;
      return color + " " + start + "% " + end + "%";
    });
    return "linear-gradient(to right, " + stops.join(", ") + ")";
  }

  function mixOkLch(a, b) {
    return "color-mix(in oklch, " + a + ", " + b + ")";
  }

  /* Mixes branch key color (if specified) + workstream key color (if specified). */
  function cardFill(branchValue, workstreamValue) {
    const branches = keyColorEntries(branchValue, "branchKeys", "branchColorKeys", BRANCH_OPACITY);
    const streams = keyColorEntries(
      workstreamValue,
      "workstreamKeys",
      "workstreamColorKeys",
      WORKSTREAM_OPACITY
    );
    if (branches === null || streams === null) return "#fff";
    if (!branches.length && !streams.length) return "#fff";
    if (!streams.length) return gradientFill(branches.map((item) => item.color));
    if (!branches.length) return gradientFill(streams.map((item) => item.color));
    const mixed = [];
    branches.forEach((branch) => {
      streams.forEach((stream) => {
        mixed.push(mixOkLch(branch.color, stream.color));
      });
    });
    return gradientFill(mixed);
  }

  function functionLayerPx() {
    return functionMark === "stack" ? STACK_PX : SLICE_PX;
  }

  function functionColors(value) {
    const tokens = String(value || "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!tokens.length) return [];
    const names = Object.values((window.ALIAS && window.ALIAS.functionKeys) || {});
    const colors = Object.values((window.ALIAS && window.ALIAS.functionColorKeys) || {});
    const picked = [];
    for (const token of tokens) {
      const index = names.indexOf(token);
      if (index < 0 || !colors[index]) return [];
      picked.push(withOpacity(colors[index], FUNCTION_OPACITY));
    }
    return picked;
  }

  function legendPairs(nameMap, colorMap, opacity, kind) {
    const names = Object.values(nameMap || {});
    const colors = Object.values(colorMap || {});
    const count = Math.min(names.length, colors.length);
    const items = [];
    for (let i = 0; i < count; i += 1) {
      const name = String(names[i] || "").trim();
      const color = String(colors[i] || "").trim();
      if (!name || !color) continue;
      items.push({
        kind: kind,
        name,
        color: opacity < 1 ? withOpacity(color, opacity) : color,
      });
    }
    return items;
  }

  function mixLegendPairs(rows) {
    const alias = window.ALIAS || {};
    const branchNames = Object.values(alias.branchKeys || {});
    const branchColors = Object.values(alias.branchColorKeys || {});
    const streamNames = Object.values(alias.workstreamKeys || {});
    const streamColors = Object.values(alias.workstreamColorKeys || {});
    const seen = new Map();
    (rows || []).forEach((row) => {
      const branches = splitTokens(row.branch);
      const streams = splitTokens(row.workstream);
      if (!branches.length || !streams.length) return;
      branches.forEach((branchName) => {
        streams.forEach((streamName) => {
          const key = branchName + "\0" + streamName;
          if (seen.has(key)) return;
          const bi = branchNames.indexOf(branchName);
          const si = streamNames.indexOf(streamName);
          if (bi < 0 || si < 0 || !branchColors[bi] || !streamColors[si]) return;
          seen.set(key, {
            kind: "mix",
            name: branchName + " " + streamName,
            branch: branchName,
            stream: streamName,
            color: mixOkLch(
              withOpacity(branchColors[bi], BRANCH_OPACITY),
              withOpacity(streamColors[si], WORKSTREAM_OPACITY)
            ),
          });
        });
      });
    });
    return Array.from(seen.values());
  }

  function legendKey(entry) {
    return String(entry.kind || "") + "\0" + String(entry.name || "");
  }

  function legendItemHtml(item) {
    const on = legendSelected.some((entry) => legendKey(entry) === legendKey(item));
    const dim = legendSelected.length > 0 && !on;
    const cls = "legend-item" + (on ? " is-on" : "") + (dim ? " is-dim" : "");
    const branchAttr = item.branch ? ` data-branch="${esc(item.branch)}"` : "";
    const streamAttr = item.stream ? ` data-stream="${esc(item.stream)}"` : "";
    return (
      `<button type="button" class="${cls}" data-kind="${esc(item.kind)}" data-name="${esc(item.name)}"` +
      branchAttr + streamAttr + ` aria-pressed="${on ? "true" : "false"}">` +
      `<span class="legend-dot" style="background:${esc(item.color)}"></span>` +
      `<span>${esc(item.name)}</span></button>`
    );
  }

  function personMatchesLegend(row, entry) {
    if (!row || !entry) return false;
    if (entry.kind === "branch") return splitTokens(row.branch).includes(entry.name);
    if (entry.kind === "function") return splitTokens(row.function).includes(entry.name);
    if (entry.kind === "workstream") return splitTokens(row.workstream).includes(entry.name);
    if (entry.kind === "project") {
      const col = projectColumns().find((item) => item.header === entry.name);
      if (!col) return false;
      return String((row.projects && row.projects[col.key]) || "").trim().toUpperCase() === "Y";
    }
    if (entry.kind === "mix") {
      return splitTokens(row.branch).includes(entry.branch) &&
        splitTokens(row.workstream).includes(entry.stream);
    }
    return false;
  }

  function personMatchesAny(row) {
    return legendSelected.some((entry) => personMatchesLegend(row, entry));
  }

  function expandLegendMatches() {
    if (!chart) return;
    const state = chart.getChartState();
    state.allNodes.forEach((node) => {
      node.data._expanded = node.data.id === FOREST_ID;
    });
    state.allNodes.forEach((node) => {
      if (node.data.id === FOREST_ID || !personMatchesAny(node.data)) return;
      let current = node.parent;
      while (current) {
        current.data._expanded = true;
        current = current.parent;
      }
    });
  }

  function chartDuration() {
    const state = chart && chart.getChartState();
    return state && typeof state.duration === "number" ? state.duration : 400;
  }

  function withInstantLayout(update) {
    const previous = chartDuration();
    chart.duration(0);
    try {
      update();
    } finally {
      chart.duration(previous || 400);
    }
  }

  function runChartUpdate(update) {
    const overlay = document.getElementById("chartBusy");
    if (overlay) overlay.hidden = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          update();
        } finally {
          if (overlay) overlay.hidden = true;
        }
      });
    });
  }

  function applyLegendLayout() {
    if (!chart) return;
    withInstantLayout(() => {
      if (legendAutoExpand) {
        if (legendSelected.length) expandLegendMatches();
        else applyInitialExpansion();
        chart.render().fit();
      } else {
        chart.render();
      }
    });
  }

  function refreshLegendChart() {
    renderLegend(rawData);
    if (!chart) return;
    runChartUpdate(applyLegendLayout);
  }

  function disableWheelZoom() {
    const zoom = chart && chart.getChartState().zoomBehavior;
    if (!zoom || typeof zoom.filter !== "function") return;
    zoom.filter((event) => {
      if (!event || event.type === "wheel") return false;
      return !event.ctrlKey && !event.button;
    });
  }

  const EXPORT_CARD_CSS = [
    "body { margin: 0; background: #f3f3f3; }",
    "svg { display: block; max-width: 100%; height: auto; }",
    ".node-foreign-object-div, .node-foreign-object-div div { font-family: \"Segoe UI\", Tahoma, Geneva, Verdana, sans-serif; }",
    ".node-title { display: inline-block; width: auto; max-width: 100%; margin-top: 4px; padding: 1px 6px; font-size: 11px; line-height: 1.2; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: #e6d6d6; border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 4px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 1px 2px rgba(15, 23, 42, 0.08); vertical-align: top; }",
    ".project-dots { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; margin-top: 4px; }",
    ".project-dot { width: 8px; height: 8px; border-radius: 50%; box-sizing: border-box; flex: 0 0 auto; border: 1px solid transparent; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12); }",
    ".project-dot.is-off { background: #d4d4d8; border-color: #a1a1aa; box-shadow: none; }",
  ].join("\n");

  async function inlineExportFlags(root) {
    const images = Array.from(root.querySelectorAll("img"));
    const cache = new Map();
    for (const img of images) {
      const src = img.getAttribute("src") || "";
      if (!src || src.startsWith("data:")) continue;
      if (!cache.has(src)) {
        try {
          const response = await fetch(src);
          if (!response.ok) throw new Error("missing");
          const text = await response.text();
          cache.set(src, "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text));
        } catch (err) {
          cache.set(src, src);
        }
      }
      img.setAttribute("src", cache.get(src));
    }
  }

  function frameExportSvg(svg, nodes) {
    const center = svg.querySelector(".center-group");
    const chartGroup = svg.querySelector(".chart");
    if (chartGroup) chartGroup.setAttribute("transform", "");
    if (center) center.setAttribute("transform", "");
    svg.querySelectorAll(".node-button-g").forEach((button) => button.remove());
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    (nodes || []).forEach((node) => {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
      const width = Number.isFinite(node.width) ? node.width : 0;
      const height = Number.isFinite(node.height) ? node.height : 0;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + width);
      maxY = Math.max(maxY, node.y + height);
    });
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      minX = 0;
      minY = 0;
      maxX = 1600;
      maxY = 900;
    }
    const pad = 40;
    const width = Math.max(1, Math.ceil(maxX - minX + pad * 2));
    const height = Math.max(1, Math.ceil(maxY - minY + pad * 2));
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", (minX - pad) + " " + (minY - pad) + " " + width + " " + height);
  }

  function downloadExportHtml(svgMarkup) {
    const html = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\" />\n<title>Org chart</title>\n<style>\n" +
      EXPORT_CARD_CSS + "\n</style>\n</head>\n<body>\n" + svgMarkup + "\n</body>\n</html>\n";
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "org-chart.html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function exportMapHtml() {
    if (!chart || !rawData.length) return;
    const overlay = document.getElementById("chartBusy");
    if (overlay) overlay.hidden = false;
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    const host = document.createElement("div");
    host.id = "export-chart";
    host.style.cssText = "position:fixed;left:-12000px;top:0;width:1600px;height:900px;overflow:hidden;pointer-events:none;";
    document.body.appendChild(host);
    try {
      const exportData = withForest(rawData).map((row) => ({ ...row, _expanded: true }));
      const exportChart = new d3.OrgChart()
        .container("#export-chart")
        .data(exportData)
        .svgWidth(1600)
        .svgHeight(900)
        .nodeWidth((d) => (d.data.id === FOREST_ID ? 8 : 228))
        .nodeHeight((d) => (d.data.id === FOREST_ID ? 8 : 72 + projectBandHeight()))
        .nodeButtonWidth(() => 0)
        .nodeButtonHeight(() => 0)
        .childrenMargin(() => 40)
        .compactMarginBetween(() => 24)
        .compactMarginPair(() => 40)
        .neighbourMargin(() => 28)
        .duration(0)
        .nodeContent(nodeContent);
      exportChart.render();
      const svg = host.querySelector("svg");
      if (!svg) return;
      frameExportSvg(svg, exportChart.getChartState().allNodes);
      await inlineExportFlags(svg);
      downloadExportHtml(svg.outerHTML);
    } finally {
      host.remove();
      if (overlay) overlay.hidden = true;
    }
  }

  function toggleLegend(button) {
    const entry = {
      kind: button.dataset.kind || "",
      name: button.dataset.name || "",
      branch: button.dataset.branch || "",
      stream: button.dataset.stream || "",
    };
    const index = legendSelected.findIndex((item) => legendKey(item) === legendKey(entry));
    if (!legendMulti) {
      legendSelected = index >= 0 && legendSelected.length === 1 ? [] : [entry];
    } else if (index >= 0) {
      legendSelected.splice(index, 1);
    } else {
      legendSelected.push(entry);
    }
    refreshLegendChart();
  }

  function legendGroupHtml(label, items) {
    if (!items.length) return "";
    return (
      `<div class="legend-group">` +
      `<span class="legend-group-label">${esc(label)}</span>` +
      `<span class="legend-group-items">${items.map(legendItemHtml).join("")}</span>` +
      `</div>`
    );
  }

  function legendLinesHtml(items) {
    const lines = [];
    for (let i = 0; i < items.length; i += LEGEND_PER_LINE) {
      lines.push(items.slice(i, i + LEGEND_PER_LINE));
    }
    return lines
      .map((line) => `<div class="legend-col">${line.map(legendItemHtml).join("")}</div>`)
      .join("");
  }

  function renderLegend(rows) {
    const el = document.getElementById("legend");
    if (!el) return;
    const alias = window.ALIAS || {};
    const people = rows || rawData || [];
    const baseGroups = [
      { label: "branch", items: legendPairs(alias.branchKeys, alias.branchColorKeys, BRANCH_OPACITY, "branch") },
      { label: "function", items: legendPairs(alias.functionKeys, alias.functionColorKeys, FUNCTION_OPACITY, "function") },
      { label: "workstream", items: legendPairs(alias.workstreamKeys, alias.workstreamColorKeys, WORKSTREAM_OPACITY, "workstream") },
      { label: "project", items: legendPairs(alias.projectKeys, alias.projectColorKeys, 1, "project") },
    ].filter((group) => group.items.length);
    const baseHtml = baseGroups.length
      ? `<div class="legend-col legend-base">${baseGroups
          .map((group) => legendGroupHtml(group.label, group.items))
          .join("")}</div>`
      : "";
    const mixItems = mixLegendPairs(people);
    el.innerHTML = baseHtml + legendLinesHtml(mixItems);
  }

  function flagFile(location) {
    const map = (window.ALIAS && window.ALIAS.locationKeys) || {};
    const match = Object.entries(map).find(([, label]) => label === location);
    return match ? "./assets/" + match[0] + ".svg" : "";
  }

  function projectBandHeight() {
    const count = projectColumns().length;
    if (!count) return 0;
    const rows = Math.ceil(count / 14);
    return 4 + rows * 11;
  }

  function projectDotsHtml(flags) {
    const columns = projectColumns();
    if (!columns.length) return "";
    const colors = Object.values((window.ALIAS && window.ALIAS.projectColorKeys) || {});
    const dots = columns.map((col, index) => {
      const on = String((flags && flags[col.key]) || "").trim().toUpperCase() === "Y";
      const color = on ? String(colors[index] || "#94a3b8").trim() : "";
      const style = on ? ` style="background:${esc(color)}"` : "";
      return `<span class="project-dot${on ? "" : " is-off"}" title="${esc(col.header)}"${style}></span>`;
    }).join("");
    return `<div class="project-dots" aria-label="Projects">${dots}</div>`;
  }

  function nodeContent(d) {
    if (d.data.id === FOREST_ID) {
      return `<div style="width:${d.width}px;height:${d.height}px"></div>`;
    }
    const name = d.data.name || "";
    const title = d.data.title || "";
    const shortName = name.length > 20 ? `${name.slice(0, 18)}…` : name;
    const shortTitle = title.length > 26 ? `${title.slice(0, 24)}…` : title;
    const important = String(d.data.importance || "").trim().toUpperCase() === "Y";
    const faded = legendSelected.length && !personMatchesAny(d.data);
    const nameColor = faded ? "#94a3b8" : "#1e293b";
    const cardOpacity = faded ? "opacity:0.05;" : "";
    const flag = flagFile(d.data.location);
    const fill = cardFill(d.data.branch, d.data.workstream);
    const borderColors = functionColors(d.data.function);
    const mark = important
      ? `<span title="Important" style="flex:0 0 auto;margin-right:4px;color:#7ec8e3;font-weight:700;line-height:1;">*</span>`
      : "";
    const flagHtml = flag
      ? `<div style="width:28px;height:28px;border-radius:50%;background:#f4f6f8;border:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;flex:0 0 auto;"><img src="${esc(flag)}" alt="${esc(d.data.location)}" style="width:18px;object-fit:contain;display:block;" /></div>`
      : "";
    const body = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:28px;flex:0 0 auto;">
          ${flagHtml}
          <div class="location-indicators" style="display:flex;flex-direction:column;align-items:center;gap:3px;min-height:8px;"></div>
        </div>
        <div style="min-width:0;flex:1 1 auto;">
          <div style="display:flex;align-items:center;font-size:13px;font-weight:700;color:${nameColor};line-height:1.2;">
            ${mark}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(shortName)}</span>
          </div>
          <div class="node-title">${esc(shortTitle)}</div>
          ${projectDotsHtml(d.data.projects)}
        </div>`;
    if (!borderColors.length) {
      return `
      <div style="
        width:${d.width}px;
        height:${d.height}px;
        padding:8px 10px 8px 8px;
        background:${fill};
        border:2px solid #cbd5e1;
        border-radius:${CARD_RADIUS}px;
        ${cardOpacity}
        display:flex;
        align-items:center;
        gap:8px;
        box-sizing:border-box;
      ">${body}
      </div>
    `;
    }
    const slice = functionLayerPx();
    const total = slice * borderColors.length;
    let html = `
      <div style="
        width:100%;
        height:100%;
        padding:8px 10px 8px 8px;
        background:${fill};
        border-radius:${Math.max(0, CARD_RADIUS - total)}px;
        display:flex;
        align-items:center;
        gap:8px;
        box-sizing:border-box;
      ">${body}
      </div>`;
    for (let index = borderColors.length - 1; index >= 0; index -= 1) {
      const outer = index === 0;
      const radius = Math.max(0, CARD_RADIUS - slice * index);
      html = `
      <div style="
        ${outer ? `width:${d.width}px;height:${d.height}px;` : "width:100%;height:100%;"}
        ${outer ? cardOpacity : ""}
        padding:${slice}px;
        background:${borderColors[index]};
        border-radius:${radius}px;
        box-sizing:border-box;
      ">${html}
      </div>`;
    }
    return html;
  }

  function sizeChartToContainer() {
    if (!chart) return;
    const el = document.getElementById("chart-container");
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    chart.svgWidth(rect.width).svgHeight(rect.height);
  }

  function applyInitialExpansion() {
    if (!chart) return;
    const state = chart.getChartState();
    const hasForest = state.allNodes.some((d) => d.data.id === FOREST_ID);
    const limit = hasForest ? INITIAL_EXPAND_LEVEL + 1 : INITIAL_EXPAND_LEVEL;
    state.allNodes.forEach((d) => {
      d.data._expanded = d.depth < limit;
    });
  }

  function buildChart(data, options) {
    rawData = normalizeRows(data).filter((row) => row.id !== FOREST_ID);
    if (!rawData.length) {
      showStatus("CSV has no usable rows (need id, name, title, parentId).", true);
      return;
    }
    const parentError = resolveParentNames(rawData);
    if (parentError) {
      showStatus(parentError, true);
      return;
    }
    const chartData = withForest(rawData);
    legendSelected = [];

    if (!options || !options.keepStatus) hideStatus();
    populateDirectorDropdown(rawData);
    renderLegend(rawData);

    document.getElementById("chart-container").innerHTML = "";

    chart = new d3.OrgChart()
      .container("#chart-container")
      .data(chartData)
      .nodeWidth((d) => (d.data.id === FOREST_ID ? 8 : 228))
      .nodeHeight((d) => (d.data.id === FOREST_ID ? 8 : 72 + projectBandHeight()))
      .nodeButtonWidth((d) => (d.data.id === FOREST_ID ? 0 : 40))
      .nodeButtonHeight((d) => (d.data.id === FOREST_ID ? 0 : 40))
      .childrenMargin(() => 40)
      .compactMarginBetween(() => 24)
      .compactMarginPair(() => 40)
      .neighbourMargin(() => 28)
      .linkUpdate(function (d) {
        //const highlighted = d.data._upToTheRootHighlighted;
        d3.select(this)
          .attr("fill", "none")
          .attr("stroke", "lightGrey")
          .attr("stroke-width", 2)
          //.attr("stroke", highlighted ? "#E27396" : "#4b5563")
          //.attr("stroke-width", highlighted ? 5 : 2);
        //if (highlighted) d3.select(this).raise();
      })
      .nodeContent(nodeContent)
      .onExpandOrCollapse((node) => {
        if (node.data.id === FOREST_ID) return;
        syncJumpSelection(node);
      });

    const originalButtonClick = chart.onButtonClick.bind(chart);
    chart.onButtonClick = (event, node) => {
      if (node && node.data && node.data.id === FOREST_ID) {
        if (event && event.stopPropagation) event.stopPropagation();
        return;
      }
      return originalButtonClick(event, node);
    };

    sizeChartToContainer();
    chart.render();

    applyInitialExpansion();
    sizeChartToContainer();
    chart.render().fit();
    disableWheelZoom();
    window.__orgChart = chart;
  }

  function syncJumpSelection(node) {
    if (!node) return;
    let current = node;
    while (current) {
      const id = String(current.data.id);
      if (directorSelect.querySelector('option[value="' + id + '"]')) {
        directorSelect.value = id;
        return;
      }
      current = current.parent;
    }
  }

  function searchMatches(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored = [];
    rawData.forEach((row) => {
      const name = String(row.name || "").toLowerCase();
      const id = String(row.id || "").toLowerCase();
      let score = 0;
      if (id === q) score = 100;
      else if (name === q) score = 90;
      else if (name.startsWith(q)) score = 70;
      else if (id.startsWith(q)) score = 60;
      else if (name.includes(q)) score = 40;
      else if (id.includes(q)) score = 30;
      if (score) scored.push({ row, score });
    });
    scored.sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name));
    return scored.slice(0, 8).map((item) => item.row);
  }

  function hideSearchResults() {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
  }

  function showSearchResults(matches, query) {
    searchResults.innerHTML = "";
    if (!query.trim()) {
      hideSearchResults();
      return;
    }
    if (!matches.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No person matches that name or ID.";
      searchResults.appendChild(empty);
      searchResults.hidden = false;
      return;
    }
    matches.forEach((row, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-selected", index === 0 ? "true" : "false");
      button.innerHTML =
        '<span class="hit-name"></span><span class="hit-meta"></span>';
      button.querySelector(".hit-name").textContent = row.name;
      button.querySelector(".hit-meta").textContent = row.title + " · ID " + row.id;
      button.addEventListener("click", () => openPerson(row.id));
      item.appendChild(button);
      searchResults.appendChild(item);
    });
    searchResults.hidden = false;
  }

  function openPerson(id) {
    hideSearchResults();
    const row = rawData.find((d) => String(d.id) === String(id));
    if (row) personSearch.value = row.name;
    jumpToView(id);
    const state = chart && chart.getChartState();
    const node = state && state.allNodes.find((n) => String(n.data.id) === String(id));
    if (node) syncJumpSelection(node);
  }

  function findChartNode(nodeId) {
    const state = chart.getChartState();
    const target = String(nodeId);
    const stack = [];
    if (state.root) stack.push(state.root);
    else if (state.allNodes) state.allNodes.forEach((n) => stack.push(n));

    while (stack.length) {
      const node = stack.pop();
      if (String(node.data.id) === target) return node;
      if (node.children) node.children.forEach((child) => stack.push(child));
      if (node._children) node._children.forEach((child) => stack.push(child));
    }
    return null;
  }

  function jumpToView(nodeId) {
    if (!chart || !nodeId) return;

    const node = findChartNode(nodeId);
    if (!node) {
      showStatus(`Could not find node id ${nodeId}.`, true);
      return;
    }

    let current = node;
    while (current) {
      current.data._expanded = true;
      current = current.parent;
    }

    const reports = node.children || node._children || [];
    reports.forEach((child) => {
      child.data._expanded = true;
    });

    chart
      .clearHighlighting()
      .setHighlighted(nodeId)
      .setCentered(nodeId)
      .render();
  }

  function resetFullView() {
    if (!chart) return;
    directorSelect.value = "";
    personSearch.value = "";
    hideSearchResults();
    chart.clearHighlighting();
    applyInitialExpansion();
    chart.render().fit();
  }

  function loadCsvText(text, sourceName) {
    pendingLoad = null;
    hideRowPrompt();
    if (!String(text || "").trim()) {
      showStatus("That CSV is empty. Please check the file and try again.", true);
      return;
    }
    const map = activeColumnMap();
    const parsed = d3.csvParse(text);
    const trimmed = (parsed.columns || []).map((name) => String(name).trim());
    const required = ["id", "name", "title", "parentId", "treePriority", "location", "importance"];
    if (map.branch) required.push("branch");
    if (map.function) required.push("function");
    if (map.workstream) required.push("workstream");
    (map.projects || []).forEach((col) => {
      map[col.key] = col.header;
      required.push(col.key);
    });
    const missing = required.filter((key) => !map[key] || !trimmed.includes(map[key]));
    if (missing.length) {
      const detail = missing.map((key) => '"' + (map[key] || key) + '" (needed for ' + key + ")").join(", ");
      showStatus("Missing column " + detail + ". Check alias.json columnKeys against this CSV.", true);
      return;
    }
    const rows = parsed
      .map((data, index) => mapCsvRecord({ line: index + 2, data: data }, map))
      .filter((row) => !isBlankPerson(row));
    if (!rows.length) {
      showStatus("The file has headers but no people rows. Please check the data.", true);
      return;
    }
    const problems = rowProblems(rows, map);
    if (problems.length) {
      pendingLoad = { rows: rows, map: map, sourceName: sourceName };
      showRowPrompt(problems);
      return;
    }
    if (map.branch) {
      const branchColors = colorCountReason(rows, "branch", "branchKeys", "branchColorKeys");
      if (branchColors) {
        showStatus(branchColors, true);
        return;
      }
    }
    if (map.function) {
      const functionColors = colorCountReason(rows, "function", "functionKeys", "functionColorKeys");
      if (functionColors) {
        showStatus(functionColors, true);
        return;
      }
    }
    if (map.workstream) {
      const workstreamColors = colorCountReason(
        rows,
        "workstream",
        "workstreamKeys",
        "workstreamColorKeys"
      );
      if (workstreamColors) {
        showStatus(workstreamColors, true);
        return;
      }
    }
    const projectColors = projectColorCountReason();
    if (projectColors) {
      showStatus(projectColors, true);
      return;
    }
    finishCsvLoad(rows, sourceName, 0);
  }

  function aliasIsUsable(alias) {
    return Boolean(alias && alias.columnKeys && alias.locationKeys);
  }

  async function loadAlias() {
    try {
      const response = await fetch("./alias.json");
      if (!response.ok) throw new Error("missing");
      const alias = await response.json();
      if (aliasIsUsable(alias)) window.ALIAS = alias;
    } catch (err) {
      // Opening index.html by double-click cannot read alias.json.
      // prepare.html stores that same mapping on window.ALIAS in data.js.
    }
    if (!aliasIsUsable(window.ALIAS)) window.ALIAS = FALLBACK_ALIAS;
    renderLegend();
  }

  async function tryFetchDefaultCsv() {
    await loadAlias();
    // Bundled data works by double-clicking index.html (no Node, no server).
    if (Array.isArray(window.ORG_DATA) && window.ORG_DATA.length) {
      setSourceName(window.ORG_SOURCE || "");
      buildChart(window.ORG_DATA);
      return;
    }

    try {
      const response = await fetch(CSV_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      loadCsvText(text, "hr_org.csv");
    } catch (err) {
      showStatus(
        "No bundled data found. Click Load CSV and choose hr_org.csv.",
        true
      );
      console.warn(err);
    }
  }

  personSearch.addEventListener("input", () => {
    showSearchResults(searchMatches(personSearch.value), personSearch.value);
  });

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const matches = searchMatches(personSearch.value);
    if (!matches.length) {
      showSearchResults([], personSearch.value);
      return;
    }
    const exact = matches.find(
      (row) => String(row.id).toLowerCase() === personSearch.value.trim().toLowerCase()
    );
    openPerson((exact || matches[0]).id);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrap")) hideSearchResults();
  });

  directorSelect.addEventListener("change", (e) => {
    const id = e.target.value;
    if (!id) {
      resetFullView();
      return;
    }
    jumpToView(id);
  });

  if (functionMarkSelect) {
    const sliceOption = functionMarkSelect.querySelector('option[value="slice"]');
    const stackOption = functionMarkSelect.querySelector('option[value="stack"]');
    if (sliceOption) sliceOption.textContent = "Slice, " + SLICE_PX + "px each";
    if (stackOption) stackOption.textContent = "Stack, " + STACK_PX + "px each";
    const savedMark = localStorage.getItem("orgFunctionMark");
    if (savedMark === "stack" || savedMark === "slice") {
      functionMark = savedMark;
      functionMarkSelect.value = savedMark;
    }
    functionMarkSelect.addEventListener("change", () => {
      functionMark = functionMarkSelect.value === "stack" ? "stack" : "slice";
      localStorage.setItem("orgFunctionMark", functionMark);
      if (chart) chart.render();
    });
  }

  resetBtn.addEventListener("click", resetFullView);

  const legendEl = document.getElementById("legend");
  if (legendEl) {
    legendEl.addEventListener("click", (event) => {
      const button = event.target.closest("button.legend-item");
      if (!button || !legendEl.contains(button)) return;
      toggleLegend(button);
    });
  }

  const legendMultiInput = document.getElementById("legendMulti");
  if (legendMultiInput) {
    legendMultiInput.addEventListener("change", () => {
      legendMulti = legendMultiInput.checked;
      if (!legendMulti && legendSelected.length > 1) {
        legendSelected = [legendSelected[legendSelected.length - 1]];
      }
      refreshLegendChart();
    });
  }

  const legendAutoInput = document.getElementById("legendAutoExpand");
  if (legendAutoInput) {
    legendAutoInput.addEventListener("change", () => {
      legendAutoExpand = legendAutoInput.checked;
      if (!chart) return;
      if (legendAutoExpand && !legendSelected.length) return;
      runChartUpdate(() => {
        withInstantLayout(() => {
          if (legendAutoExpand && legendSelected.length) expandLegendMatches();
          else applyInitialExpansion();
          chart.render().fit();
        });
      });
    });
  }

  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      if (chart) chart.zoomIn();
    });
  }
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      if (chart) chart.zoomOut();
    });
  }

  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      exportMapHtml().catch((err) => {
        const overlay = document.getElementById("chartBusy");
        if (overlay) overlay.hidden = true;
        showStatus("Could not export the chart.", true);
        console.warn(err);
      });
    });
  }

  csvInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (!aliasIsUsable(window.ALIAS)) await loadAlias();
      loadCsvText(await file.text(), file.name);
    } catch (err) {
      showStatus("Failed to read the selected CSV file.", true);
      console.warn(err);
    }
  });

  if (skipRowsBtn) {
    skipRowsBtn.addEventListener("click", () => {
      if (!pendingLoad) return;
      const drop = new Set(
        Array.from(rowErrorBody.querySelectorAll("tr")).map((tr) => Number(tr.firstChild.textContent))
      );
      const sourceName = pendingLoad.sourceName;
      const map = pendingLoad.map;
      const kept = pendingLoad.rows.filter((row) => !drop.has(row._line));
      pendingLoad = null;
      hideRowPrompt();
      if (!kept.length) {
        showStatus("No people left after skipping those rows.", true);
        return;
      }
      const stillBad = rowProblems(kept, map);
      if (stillBad.length) {
        pendingLoad = { rows: kept, map: map, sourceName: sourceName };
        showRowPrompt(stillBad);
        return;
      }
      if (map.branch) {
        const branchColors = colorCountReason(kept, "branch", "branchKeys", "branchColorKeys");
        if (branchColors) {
          showStatus(branchColors, true);
          return;
        }
      }
      if (map.function) {
        const functionColors = colorCountReason(kept, "function", "functionKeys", "functionColorKeys");
        if (functionColors) {
          showStatus(functionColors, true);
          return;
        }
      }
      if (map.workstream) {
        const workstreamColors = colorCountReason(
          kept,
          "workstream",
          "workstreamKeys",
          "workstreamColorKeys"
        );
        if (workstreamColors) {
          showStatus(workstreamColors, true);
          return;
        }
      }
      const projectColors = projectColorCountReason();
      if (projectColors) {
        showStatus(projectColors, true);
        return;
      }
      finishCsvLoad(kept, sourceName, drop.size);
    });
  }

  if (cancelRowsBtn) {
    cancelRowsBtn.addEventListener("click", () => {
      pendingLoad = null;
      hideRowPrompt();
      showStatus("Load cancelled. The chart is unchanged.");
    });
  }

  tryFetchDefaultCsv();
})();
