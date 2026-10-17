(() => {
  const INITIAL_EXPAND_LEVEL = 2; // CEO(0) → VP(1) → Director(2)
  const FOREST_ID = "__all_trees__";
  const CSV_URL = "./hr_org.csv";

  let chart = null;
  let rawData = [];

  const statusEl = document.getElementById("status");
  const directorSelect = document.getElementById("directorSelect");
  const resetBtn = document.getElementById("resetBtn");
  const csvInput = document.getElementById("csvInput");
  const searchForm = document.getElementById("searchForm");
  const personSearch = document.getElementById("personSearch");
  const searchResults = document.getElementById("searchResults");

  function showStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
    statusEl.classList.add("visible");
  }

  function hideStatus() {
    statusEl.classList.remove("visible", "error");
    statusEl.textContent = "";
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
        };
      });
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

  function branchFill(value) {
    const tokens = String(value || "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!tokens.length) return "#fff";
    const branches = Object.values((window.ALIAS && window.ALIAS.branchKeys) || {});
    const colors = Object.values((window.ALIAS && window.ALIAS.hexColorKeys) || {});
    const picked = [];
    for (const token of tokens) {
      const index = branches.indexOf(token);
      if (index < 0 || !colors[index]) return "#fff";
      picked.push(colors[index]);
    }
    if (picked.length === 1) return picked[0];
    const stops = picked.map((color, index) => {
      const start = (100 * index) / picked.length;
      const end = (100 * (index + 1)) / picked.length;
      return color + " " + start + "% " + end + "%";
    });
    return "linear-gradient(to right, " + stops.join(", ") + ")";
  }

  function flagFile(location) {
    const map = (window.ALIAS && window.ALIAS.locationKeys) || {};
    const match = Object.entries(map).find(([, label]) => label === location);
    return match ? "./assets/" + match[0] + ".svg" : "";
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
    const flag = flagFile(d.data.location);
    const cardFill = branchFill(d.data.branch);
    const mark = important
      ? `<span title="Important" style="flex:0 0 auto;margin-right:4px;color:#7ec8e3;font-weight:700;line-height:1;">*</span>`
      : "";
    const flagHtml = flag
      ? `<div style="width:28px;height:28px;border-radius:50%;background:#f4f6f8;border:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;flex:0 0 auto;"><img src="${esc(flag)}" alt="${esc(d.data.location)}" style="width:18px;height:12px;object-fit:contain;display:block;" /></div>`
      : "";
    return `
      <div style="
        width:${d.width}px;
        height:${d.height}px;
        padding:8px 10px 8px 8px;
        background:${cardFill};
        border:2px solid #cbd5e1;
        border-radius:8px;
        display:flex;
        align-items:center;
        gap:8px;
        box-sizing:border-box;
      ">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:28px;flex:0 0 auto;">
          ${flagHtml}
          <div class="location-indicators" style="display:flex;flex-direction:column;align-items:center;gap:3px;min-height:8px;"></div>
        </div>
        <div style="min-width:0;flex:1 1 auto;">
          <div style="display:flex;align-items:center;font-size:13px;font-weight:700;color:#1e293b;line-height:1.2;">
            ${mark}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(shortName)}</span>
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:4px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(shortTitle)}</div>
        </div>
      </div>
    `;
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

  function buildChart(data) {
    rawData = normalizeRows(data).filter((row) => row.id !== FOREST_ID);
    if (!rawData.length) {
      showStatus("CSV has no usable rows (need id, name, title, parentId).", true);
      return;
    }
    const chartData = withForest(rawData);

    hideStatus();
    populateDirectorDropdown(rawData);

    document.getElementById("chart-container").innerHTML = "";

    chart = new d3.OrgChart()
      .container("#chart-container")
      .data(chartData)
      .nodeWidth((d) => (d.data.id === FOREST_ID ? 8 : 228))
      .nodeHeight((d) => (d.data.id === FOREST_ID ? 8 : 72))
      .nodeButtonWidth((d) => (d.data.id === FOREST_ID ? 0 : 40))
      .nodeButtonHeight((d) => (d.data.id === FOREST_ID ? 0 : 40))
      .childrenMargin(() => 40)
      .compactMarginBetween(() => 24)
      .compactMarginPair(() => 40)
      .neighbourMargin(() => 28)
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

  async function loadCsvText(text) {
    const parsed = d3.csvParse(text);
    buildChart(parsed);
  }

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
      branch1: "HK1",
      branch2: "HK2",
      branch3: "UK1",
    },
    hexColorKeys: {
      color1: "#FF7F7F",
      color2: "#98FB98",
      color3: "#87CEFA",
      color4: "#D8BFD8",
    },
  };

  async function loadAlias() {
    if (window.ALIAS && window.ALIAS.locationKeys && window.ALIAS.columnKeys) return;
    try {
      const response = await fetch("./alias.json");
      if (!response.ok) throw new Error("missing");
      window.ALIAS = await response.json();
    } catch (err) {
      window.ALIAS = FALLBACK_ALIAS;
    }
  }

  async function tryFetchDefaultCsv() {
    await loadAlias();
    // Bundled data works by double-clicking index.html (no Node, no server).
    if (Array.isArray(window.ORG_DATA) && window.ORG_DATA.length) {
      buildChart(window.ORG_DATA);
      return;
    }

    try {
      const response = await fetch(CSV_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      await loadCsvText(text);
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

  resetBtn.addEventListener("click", resetFullView);

  csvInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      await loadCsvText(text);
    } catch (err) {
      showStatus("Failed to read the selected CSV file.", true);
      console.warn(err);
    }
  });

  tryFetchDefaultCsv();
})();
