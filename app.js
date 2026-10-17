(() => {
  const INITIAL_EXPAND_LEVEL = 2; // CEO(0) → VP(1) → Director(2)
  const CSV_URL = "./hr_org.csv";

  let chart = null;
  let rawData = [];

  const statusEl = document.getElementById("status");
  const directorSelect = document.getElementById("directorSelect");
  const resetBtn = document.getElementById("resetBtn");
  const csvInput = document.getElementById("csvInput");

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
        };
      });
  }

  function populateDirectorDropdown(data) {
    directorSelect.innerHTML = '<option value="">-- Select a Director / Branch --</option>';

    const directors = data.filter(
      (d) => d.title === "Head of Department" || /chief/i.test(d.title)
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

  function nodeContent(d) {
    const name = d.data.name || "";
    const title = d.data.title || "";
    const shortName = name.length > 22 ? `${name.slice(0, 20)}…` : name;
    const shortTitle = title.length > 28 ? `${title.slice(0, 26)}…` : title;
    return `
      <div style="
        width:${d.width}px;
        height:${d.height}px;
        padding:10px 12px;
        background:#fff;
        border:2px solid #cbd5e1;
        border-radius:8px;
        display:flex;
        flex-direction:column;
        justify-content:center;
        box-sizing:border-box;
      ">
        <div style="font-size:13px;font-weight:700;color:#1e293b;line-height:1.2;">${shortName}</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;line-height:1.2;">${shortTitle}</div>
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
    // depth 0–1 expanded (CEO and VPs) so directors are visible; staff stay folded
    state.allNodes.forEach((d) => {
      d.data._expanded = d.depth < INITIAL_EXPAND_LEVEL;
    });
  }

  function buildChart(data) {
    rawData = normalizeRows(data);
    if (!rawData.length) {
      showStatus("CSV has no usable rows (need id, name, title, parentId).", true);
      return;
    }

    hideStatus();
    populateDirectorDropdown(rawData);

    document.getElementById("chart-container").innerHTML = "";

    chart = new d3.OrgChart()
      .container("#chart-container")
      .data(rawData)
      .nodeWidth(() => 200)
      .nodeHeight(() => 56)
      .childrenMargin(() => 40)
      .compactMarginBetween(() => 24)
      .compactMarginPair(() => 40)
      .neighbourMargin(() => 28)
      .nodeContent(nodeContent)
      .onExpandOrCollapse((node) => {
        syncJumpSelection(node);
      });

    sizeChartToContainer();
    chart.render();

    applyInitialExpansion();
    sizeChartToContainer();
    chart.render().fit();
    window.__orgChart = chart;
  }

  function syncJumpSelection(node) {
    if (!node || !node.children) return;
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

  function jumpToView(nodeId) {
    if (!chart || !nodeId) return;

    const state = chart.getChartState();
    const node = state.allNodes.find((n) => String(n.data.id) === String(nodeId));
    if (!node) {
      showStatus(`Could not find node id ${nodeId}.`, true);
      return;
    }

    // Expand the path from root to this node, and the node itself so its branch shows
    let current = node;
    const pathIds = [];
    while (current) {
      pathIds.push(String(current.data.id));
      current = current.parent;
    }
    pathIds.reverse().forEach((id) => chart.setExpanded(id, true));

    chart
      .clearHighlighting()
      .setHighlighted(nodeId)
      .setCentered(nodeId)
      .render();
  }

  function resetFullView() {
    if (!chart) return;
    directorSelect.value = "";
    chart.clearHighlighting();
    applyInitialExpansion();
    chart.render().fit();
  }

  async function loadCsvText(text) {
    const parsed = d3.csvParse(text);
    buildChart(parsed);
  }

  async function tryFetchDefaultCsv() {
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
