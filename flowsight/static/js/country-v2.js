const DEFAULT_START_DATE_INT = 19700101;
const DEFAULT_END_DATE_INT = 19700101;

function formatDateLabel(dateInt) {
    if (!dateInt) return "";
    let raw = String(dateInt);
    if (raw.length !== 8) return raw;
    let year = Number(raw.slice(0, 4));
    let month = Number(raw.slice(4, 6)) - 1;
    let day = Number(raw.slice(6, 8));
    let date = new Date(Date.UTC(year, month, day));
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(date);
}

function formatCount(value) {
    return Number(value || 0).toLocaleString("en-GB");
}

function formatPercent(value, digits = 1) {
    if (value == null || Number.isNaN(value)) return "N/A";
    return `${(Number(value) * 100).toFixed(digits)}%`;
}

function formatSignedPercentChange(current, previous) {
    if (previous == null || previous === 0 || current == null) return "N/A";
    let delta = ((current - previous) / previous) * 100;
    let prefix = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
    return `${prefix} ${Math.abs(delta).toFixed(0)}% vs prev. period`;
}

function formatSignedPointChange(points) {
    if (points == null || Number.isNaN(points)) return "N/A";
    let prefix = points > 0 ? "↑" : points < 0 ? "↓" : "→";
    return `${prefix} ${Math.abs(points).toFixed(1)} pp`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function formatSignedValueChange(current, previous, digits = 2) {
    if (current == null || previous == null || Number.isNaN(Number(current)) || Number.isNaN(Number(previous))) {
        return "N/A";
    }
    let delta = Number(current) - Number(previous);
    let prefix = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
    return `${prefix} ${Math.abs(delta).toFixed(digits)}`;
}

function computeOverallRange(dateRanges) {
    let ranges = Object.values(dateRanges || {}).filter(
        (range) => Array.isArray(range) && range[0] && range[1]
    );
    if (ranges.length === 0) return null;
    return {
        start: Math.min(...ranges.map((range) => range[0])),
        end: Math.max(...ranges.map((range) => range[1])),
    };
}

function addDaysUTC(dateInt, deltaDays) {
    let raw = String(dateInt);
    let year = Number(raw.slice(0, 4));
    let month = Number(raw.slice(4, 6)) - 1;
    let day = Number(raw.slice(6, 8));
    let date = new Date(Date.UTC(year, month, day));
    date.setUTCDate(date.getUTCDate() + deltaDays);
    let y = date.getUTCFullYear();
    let m = String(date.getUTCMonth() + 1).padStart(2, "0");
    let d = String(date.getUTCDate()).padStart(2, "0");
    return Number(`${y}${m}${d}`);
}

function dtFromDateInt(dateInt) {
    let raw = String(dateInt);
    let year = Number(raw.slice(0, 4));
    let month = Number(raw.slice(4, 6)) - 1;
    let day = Number(raw.slice(6, 8));
    return new Date(Date.UTC(year, month, day));
}

function resolveIntervalForRange(startDateInt, endDateInt, interval) {
    if (interval && interval !== "auto") return interval;
    let start = dtFromDateInt(startDateInt);
    let end = dtFromDateInt(endDateInt);
    let diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (diffDays <= 60) return "day";
    if (diffDays <= 365) return "week";
    return "month";
}

function startOfWeekUTC(date) {
    let copy = new Date(date.getTime());
    let day = copy.getUTCDay();
    let delta = day === 0 ? -6 : 1 - day;
    copy.setUTCDate(copy.getUTCDate() + delta);
    copy.setUTCHours(0, 0, 0, 0);
    return copy;
}

function startOfMonthUTC(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function aggregateSeriesByInterval(series, interval) {
    if (!Array.isArray(series) || interval === "day") return series;
    let bucketStart = interval === "month" ? startOfMonthUTC : startOfWeekUTC;
    return series.map((entry) => {
        let buckets = new Map();
        for (let point of entry.data || []) {
            if (point.value == null) continue;
            let bucketDate = bucketStart(new Date(point.date)).getTime();
            if (!buckets.has(bucketDate)) {
                buckets.set(bucketDate, { total: 0, count: 0 });
            }
            let bucket = buckets.get(bucketDate);
            bucket.total += Number(point.value);
            bucket.count += 1;
        }
        return {
            ...entry,
            data: Array.from(buckets.entries())
                .sort((a, b) => a[0] - b[0])
                .map(([date, stats]) => ({
                    date,
                    value: stats.count ? stats.total / stats.count : null,
                })),
        };
    });
}

function deriveSummaryRange(dateRanges) {
    let tg = Array.isArray(dateRanges.tg) ? dateRanges.tg : null;
    let mc = Array.isArray(dateRanges.mc) ? dateRanges.mc : null;
    let sourceRanges = [tg, mc].filter(Boolean);
    if (sourceRanges.length === 0) {
        return {
            start: DEFAULT_START_DATE_INT,
            end: DEFAULT_END_DATE_INT,
        };
    }
    let end = Math.max(...sourceRanges.map((range) => range[1] || DEFAULT_END_DATE_INT));
    let start = addDaysUTC(end, -30);
    let minAllowed = Math.min(...sourceRanges.map((range) => range[0] || start));
    return {
        start: Math.max(start, minAllowed),
        end,
    };
}

function shiftDateIntUTC(dateInt, { years = 0, months = 0, days = 0 } = {}) {
    let date = dtFromDateInt(dateInt);
    if (years) date.setUTCFullYear(date.getUTCFullYear() + years);
    if (months) date.setUTCMonth(date.getUTCMonth() + months);
    if (days) date.setUTCDate(date.getUTCDate() + days);
    let y = date.getUTCFullYear();
    let m = String(date.getUTCMonth() + 1).padStart(2, "0");
    let d = String(date.getUTCDate()).padStart(2, "0");
    return Number(`${y}${m}${d}`);
}

function clampDateInt(dateInt, minDateInt, maxDateInt) {
    return Math.min(Math.max(dateInt, minDateInt), maxDateInt);
}

function presetRange(preset) {
    let available = window.fsV2State?.fullAvailableRange || window.fsV2State?.defaultOverallRange;
    if (!available) return null;
    let end = available.end;
    let start = available.start;
    if (preset === "1m") start = shiftDateIntUTC(end, { months: -1, days: 1 });
    if (preset === "6m") start = shiftDateIntUTC(end, { months: -6, days: 1 });
    if (preset === "1y") start = shiftDateIntUTC(end, { years: -1, days: 1 });
    if (preset === "5y") start = shiftDateIntUTC(end, { years: -5, days: 1 });
    if (preset === "10y") start = shiftDateIntUTC(end, { years: -10, days: 1 });
    if (preset === "all") start = available.start;
    start = clampDateInt(start, available.start, available.end);
    return { start, end };
}

function deriveV2State() {
    let dateRanges = window.fsV2Bootstrap?.dateRanges || {};
    let available = computeOverallRange(dateRanges) || deriveSummaryRange(dateRanges);
    let overall = deriveSummaryRange(dateRanges);
    window.fsV2State = {
        country: window.fsV2Bootstrap?.country || "sd",
        fullAvailableRange: { start: available.start, end: available.end },
        overallRange: { start: overall.start, end: overall.end },
        defaultOverallRange: { start: overall.start, end: overall.end },
        searchRange: { start: overall.start, end: overall.end },
        appliedOverallRange: { start: overall.start, end: overall.end },
        selectedDatePreset: null,
        interval: "auto",
        conditions: [],
        topicGroups: [],
        topicGroupJoin: "AND",
        activeTopicGroupId: null,
        nextTopicGroupNumber: 1,
        selectedTopicIds: [],
        selectedTopicNames: [],
        topicColorMaps: { tg: {}, mc: {} },
        appliedTopicFilterKey: "[]",
        activeTab: "summary",
        loadedTabs: { summary: false, social: false, media: false, search: false },
        tfidfMetric: "period_average",
        socialTfidf: {
            period_average: null,
            daily_peak: null,
        },
        socialStaticData: null,
        mediaStaticData: null,
        searchInterestSeries: null,
        socialMessagesLimit: 12,
        socialMessagesOffset: 0,
        socialMessagesHasMore: true,
        mediaStoriesLimit: 12,
        mediaStoriesOffset: 0,
        mediaStoriesHasMore: true,
        visualizations: {},
    };
}

function hydrateDateRangeLabel() {
    let label = document.getElementById("fsv2-date-range-label");
    if (!label) return;
    let range = window.fsV2State?.overallRange;
    if (!range) {
        label.textContent = "Date range unavailable";
        return;
    }
    label.textContent = `${formatDateLabel(range.start)} - ${formatDateLabel(range.end)}`;
}

function toDateInputValue(dateInt) {
    let raw = String(dateInt || "");
    if (raw.length !== 8) return "";
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function fromDateInputValue(value) {
    if (!value) return null;
    return Number(value.replaceAll("-", ""));
}

function formatIsoDate(value) {
    if (value == null || value === "") return "";
    let date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString().slice(0, 10);
}

function csvCell(value) {
    if (value == null) return "";
    let serialized = Array.isArray(value)
        ? value.join("; ")
        : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
    if (/[",\n]/.test(serialized)) {
        return `"${serialized.replaceAll('"', '""')}"`;
    }
    return serialized;
}

function rowsToCsv(rows, columns = null) {
    let items = Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object" && !Array.isArray(row)) : [];
    if (items.length === 0) return "";
    let resolvedColumns = Array.isArray(columns) && columns.length > 0
        ? columns
        : Array.from(items.reduce((acc, row) => {
            Object.keys(row).forEach((key) => acc.add(key));
            return acc;
        }, new Set()));
    let header = resolvedColumns.map(csvCell).join(",");
    let body = items.map((row) => resolvedColumns.map((column) => csvCell(row[column])).join(",")).join("\n");
    return `${header}\n${body}`;
}

function downloadCsv(filename, rows, columns = null) {
    let csv = rowsToCsv(rows, columns);
    if (!csv) return;
    let blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    let url = URL.createObjectURL(blob);
    let link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function sanitizeFilenameSegment(value) {
    return String(value || "chart")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "chart";
}

function visualizationStore() {
    if (!window.fsV2State.visualizations) {
        window.fsV2State.visualizations = {};
    }
    return window.fsV2State.visualizations;
}

function visualizationCard(viz) {
    let container = document.getElementById(viz.containerId);
    return container?.closest(".fsv2-card, .fsv2-kpi-card") || null;
}

function visualizationTitle(viz) {
    let card = visualizationCard(viz);
    return viz.title
        || card?.querySelector(".fsv2-card-head h2")?.textContent?.trim()
        || card?.querySelector(".fsv2-kpi-source")?.textContent?.trim()
        || "Chart";
}

function visualizationRows(viz) {
    let rows = typeof viz.csvRows === "function" ? viz.csvRows() : viz.csvRows;
    return Array.isArray(rows) ? rows : [];
}

function visualizationFilename(viz) {
    let range = viz.rangeKind === "search" ? window.fsV2State?.searchRange : window.fsV2State?.overallRange;
    let suffix = range?.start && range?.end
        ? `${range.start}-${range.end}`
        : "current";
    return `${sanitizeFilenameSegment(viz.fileStem || visualizationTitle(viz))}-${suffix}.csv`;
}

let fullscreenChartSnapshot = null;

function captureFullscreenChartSnapshot(card) {
    if (!card || !window.Highcharts) return null;
    let charts = (Highcharts.charts || [])
        .filter((chart) => chart?.renderTo && card.contains(chart.renderTo))
        .map((chart) => ({
            chart,
            width: chart.chartWidth,
            height: chart.chartHeight,
        }));
    return { card, charts };
}

function restoreFullscreenChartSnapshot(snapshot) {
    if (!snapshot?.card?.isConnected) return;

    // Restore the old pixels first. Otherwise the fullscreen-sized child keeps
    // the grid track expanded and reflow measures that distorted layout again.
    for (let item of snapshot.charts) {
        if (!item.chart?.renderTo?.isConnected) continue;
        item.chart.setSize(item.width, item.height, false);
    }

    syncWorkspaceRailHeights();
    requestAnimationFrame(() => {
        for (let item of snapshot.charts) {
            if (!item.chart?.renderTo?.isConnected) continue;
            item.chart.reflow();
        }
        syncWorkspaceRailHeights();
    });
}

function reflowChartsWithin(element) {
    if (!element || !window.Highcharts) return;
    for (let chart of Highcharts.charts || []) {
        if (chart?.renderTo && element.contains(chart.renderTo)) {
            chart.setSize(null, null, false);
            chart.reflow();
        }
    }
}

function scheduleChartResizePasses(targetElement) {
    let runPass = () => {
        syncWorkspaceRailHeights();
        reflowChartsWithin(targetElement);
    };
    requestAnimationFrame(runPass);
    setTimeout(runPass, 60);
    setTimeout(runPass, 180);
}

function updateVisualizationButtons(key) {
    let viz = visualizationStore()[key];
    if (!viz) return;
    let card = visualizationCard(viz);
    if (!card) return;
    let rows = visualizationRows(viz);
    let csvButton = card.querySelector(`.fsv2-viz-btn[data-viz-key="${key}"][data-viz-action="csv"]`);
    if (csvButton) {
        csvButton.disabled = rows.length === 0;
        csvButton.title = rows.length === 0
            ? "No data available for CSV export"
            : `Download CSV for ${visualizationTitle(viz)}`;
        csvButton.setAttribute("aria-label", csvButton.title);
    }
    let fullscreenButton = card.querySelector(`.fsv2-viz-btn[data-viz-key="${key}"][data-viz-action="fullscreen"]`);
    if (fullscreenButton) {
        let isActive = document.fullscreenElement === card;
        fullscreenButton.classList.toggle("fsv2-viz-btn-active", isActive);
        fullscreenButton.title = isActive
            ? `Exit fullscreen for ${visualizationTitle(viz)}`
            : `Open ${visualizationTitle(viz)} in fullscreen`;
        fullscreenButton.setAttribute("aria-label", fullscreenButton.title);
    }
}

function ensureVisualizationControls(key) {
    let viz = visualizationStore()[key];
    if (!viz) return;
    let card = visualizationCard(viz);
    if (!card) return;
    let toolbar = card.querySelector(".fsv2-card-tools, .fsv2-kpi-tools");
    let head = card.querySelector(".fsv2-card-head");
    if (!toolbar) {
        toolbar = document.createElement("div");
        toolbar.className = head ? "fsv2-card-tools" : "fsv2-kpi-tools";
        if (head) {
            let infoButton = head.querySelector(".fsv2-info-btn");
            head.appendChild(toolbar);
            if (infoButton) {
                toolbar.appendChild(infoButton);
            }
        } else {
            card.appendChild(toolbar);
        }
    }
    let ensureButton = (action, iconClass) => {
        let button = toolbar.querySelector(`.fsv2-viz-btn[data-viz-key="${key}"][data-viz-action="${action}"]`);
        if (button) return button;
        button = document.createElement("button");
        button.type = "button";
        button.className = "fsv2-viz-btn";
        button.dataset.vizKey = key;
        button.dataset.vizAction = action;
        button.innerHTML = `<i class="${iconClass}" aria-hidden="true"></i>`;
        button.addEventListener("click", async () => {
            let currentViz = visualizationStore()[key];
            if (!currentViz) return;
            if (action === "csv") {
                let rows = visualizationRows(currentViz);
                if (rows.length === 0) return;
                downloadCsv(visualizationFilename(currentViz), rows, currentViz.csvColumns);
                return;
            }
            let targetCard = visualizationCard(currentViz);
            if (!targetCard?.requestFullscreen) return;
            if (document.fullscreenElement === targetCard) {
                await document.exitFullscreen();
            } else {
                fullscreenChartSnapshot = captureFullscreenChartSnapshot(targetCard);
                try {
                    await targetCard.requestFullscreen();
                } catch (error) {
                    fullscreenChartSnapshot = null;
                    throw error;
                }
            }
        });
        let infoButton = toolbar.querySelector(".fsv2-info-btn");
        if (infoButton) {
            toolbar.insertBefore(button, infoButton);
        } else {
            toolbar.appendChild(button);
        }
        return button;
    };
    ensureButton("fullscreen", "ti ti-maximize");
    ensureButton("csv", "ti ti-download");
    updateVisualizationButtons(key);
}

function registerVisualization(key, options) {
    visualizationStore()[key] = {
        ...(visualizationStore()[key] || {}),
        ...options,
        key,
    };
    ensureVisualizationControls(key);
}

async function fetchJson(path, params) {
    let url = new URL(path, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
        if (value != null) url.searchParams.set(key, value);
    });
    let response = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${url.pathname}`);
    return response.json();
}

function setText(id, text) {
    let element = document.getElementById(id);
    if (element) element.textContent = text;
}

function setHTML(id, html) {
    let element = document.getElementById(id);
    if (element) element.innerHTML = html;
}

function setUnavailable(prefix, recordLabel) {
    setText(`${prefix}-kpi-value`, "Unavailable");
    setText(`${prefix}-kpi-label`, recordLabel);
    setText(`${prefix}-kpi-meta`, "Coverage summary unavailable");
}

function setLoading(containerId) {
    let container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = '<div class="fsv2-loading">Loading...</div>';
    }
}

function chartColors() {
    return {
        tg: "#1D9E75",
        mc: "#378ADD",
        amber: "#EF9F27",
        alert: "#D85A30",
        violet: "#7F77DD",
        grid: "#E0DDD5",
        text: "#888780",
        dark: "#1A1917",
        panel: "#F5F3ED",
    };
}

function normalizeIndicatorName(name) {
    return String(name || "").trim().toLowerCase();
}

function hmIndicatorColorMap() {
    return {
        "forced displacement": "#1D9E75",
        "immobility": "#378ADD",
        "migration": "#EF9F27",
        "mobility impacts": "#D85A30",
        "mobility patterns": "#7F77DD",
        "return and reintegration": "#8B6F47",
    };
}

function indicatorColor(name) {
    let map = hmIndicatorColorMap();
    let key = normalizeIndicatorName(name);
    if (map[key]) return map[key];
    return "#A8A69F";
}

function isHumanMobilityIndicator(name) {
    return Boolean(hmIndicatorColorMap()[normalizeIndicatorName(name)]);
}

function domainPalette() {
    return [
        "#A6BFE2",
        "#AED581",
        "#D6A79A",
        "#8CA252",
        "#DBBEE0",
        "#E7CB94",
        "#FFF59D",
    ];
}

function domainColor(name, fallbackIndex = 0) {
    let palette = {
        "human mobility": "#2F7D68",
        "governance and politics": "#B85C38",
        "peace and security": "#4C6FA8",
        "economy and livelihoods": "#A07A2F",
        "public health": "#8C5E99",
        "climate and environment": "#4F8A74",
        "food security": "#C06B52",
        "infrastructure and services": "#6C7A89",
        "education": "#9C7B5B",
        "other": "#8F8A80",
    };
    let key = normalizeIndicatorName(name);
    if (palette[key]) return palette[key];
    let fallback = domainPalette();
    return fallback[fallbackIndex % fallback.length];
}

function topicPaletteColor(name, fallbackIndex = 0) {
    let normalizedName = normalizeIndicatorName(name);
    let topics = window.fsV2Bootstrap?.topics || [];
    let topic = topics.find((item) => normalizeIndicatorName(item.topic) === normalizedName);
    let selectedIndex = (window.fsV2State.selectedTopicIds || []).map(Number).indexOf(Number(topic?.topic_id));
    let taxonomyIndex = topics.findIndex((item) => normalizeIndicatorName(item.topic) === normalizedName);
    let paletteIndex = selectedIndex >= 0
        ? selectedIndex
        : taxonomyIndex >= 0 ? taxonomyIndex : fallbackIndex;
    let palette = domainPalette();
    return palette[paletteIndex % palette.length];
}

function sortDomainEntries(domains) {
    return domains.sort((a, b) => {
        let aHm = normalizeIndicatorName(a.name) === "human mobility";
        let bHm = normalizeIndicatorName(b.name) === "human mobility";
        if (aHm && !bHm) return -1;
        if (!aHm && bHm) return 1;
        return a.name.localeCompare(b.name);
    });
}

function flattenNamedSeries(series, labelResolver = (name) => name) {
    return (series || []).flatMap((entry) => (entry.data || []).map((point) => ({
        series: labelResolver(entry.name),
        date: formatIsoDate(point.date),
        value: point.value,
    })));
}

function slugifyKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function topicHierarchy() {
    let domains = new Map();
    for (let item of window.fsV2Bootstrap?.topics || []) {
        let domainName = item.domain || "Other";
        let indicatorName = item.indicator || "Other";
        if (!domains.has(domainName)) {
            domains.set(domainName, { name: domainName, indicators: new Map() });
        }
        let domain = domains.get(domainName);
        if (!domain.indicators.has(indicatorName)) {
            domain.indicators.set(indicatorName, { name: indicatorName, topics: [] });
        }
        domain.indicators.get(indicatorName).topics.push({
            id: item.topic_id,
            name: item.topic,
            domain: domainName,
            indicator: indicatorName,
        });
    }
    return sortDomainEntries(Array.from(domains.values())
        .map((domain) => ({
            ...domain,
            indicators: Array.from(domain.indicators.values()).map((indicator) => ({
                ...indicator,
                topics: indicator.topics.sort((a, b) => a.name.localeCompare(b.name)),
            })).sort((a, b) => a.name.localeCompare(b.name)),
        }))
    );
}

function streamRecordLabel(stream) {
    return stream === "tg" ? "messages" : "news stories";
}

function updateTopicChip() {
    let chip = document.getElementById("fsv2-topic-chip");
    let label = document.getElementById("fsv2-topic-chip-label");
    if (!chip || !label) return;
    let selectedIds = window.fsV2State.selectedTopicIds || [];
    let selectedNames = window.fsV2State.selectedTopicNames || [];
    if (window.fsV2State.activeTab === "search" || selectedIds.length === 0) {
        chip.hidden = true;
        return;
    }
    label.textContent = selectedIds.length === 1
        ? `Topic: ${selectedNames[0] || "Selected"}`
        : `Topics: ${selectedIds.length} selected`;
    if ((window.fsV2State.topicGroups || []).length > 1) {
        label.textContent += window.fsV2State.topicGroupJoin === "AND"
            ? " · Match all groups"
            : " · Match any group";
    }
    chip.hidden = false;
}

function renderSelectedTopicSummary() {
    let container = document.getElementById("fsv2-topic-selection-summary");
    if (!container) return;
    let groups = window.fsV2State.topicGroups || [];
    let topicsById = new Map((window.fsV2Bootstrap?.topics || []).map((topic) => [
        Number(topic.topic_id),
        topic,
    ]));
    let groupJoin = window.fsV2State.topicGroupJoin || "AND";
    let hierarchy = topicHierarchy();
    let summarizeGroup = (group) => {
        let selectedIds = new Set((group.topicIds || []).map(Number));
        let labels = [];
        let pillars = new Map();
        for (let topic of window.fsV2Bootstrap?.topics || []) {
            if (!topic.pillar) continue;
            if (!pillars.has(topic.pillar)) pillars.set(topic.pillar, []);
            pillars.get(topic.pillar).push(Number(topic.topic_id));
        }
        for (let [pillarName, pillarTopicIds] of pillars) {
            if (pillarTopicIds.length && pillarTopicIds.every((topicId) => selectedIds.has(topicId))) {
                labels.push(pillarName);
                pillarTopicIds.forEach((topicId) => selectedIds.delete(topicId));
            }
        }
        for (let domain of hierarchy) {
            let domainTopicIds = domain.indicators.flatMap((indicator) => indicator.topics).map((topic) => Number(topic.id));
            if (domainTopicIds.length && domainTopicIds.every((topicId) => selectedIds.has(topicId))) {
                labels.push(domain.name);
                domainTopicIds.forEach((topicId) => selectedIds.delete(topicId));
                continue;
            }
            for (let indicator of domain.indicators) {
                let indicatorTopicIds = indicator.topics.map((topic) => Number(topic.id));
                if (indicatorTopicIds.length && indicatorTopicIds.every((topicId) => selectedIds.has(topicId))) {
                    labels.push(indicator.name);
                    indicatorTopicIds.forEach((topicId) => selectedIds.delete(topicId));
                }
            }
        }
        for (let topicId of selectedIds) {
            let topicName = topicsById.get(topicId)?.topic;
            if (topicName) labels.push(topicName);
        }
        return labels;
    };
    let expression = groups.map((group) => {
        let topicNames = summarizeGroup(group);
        let joiner = group.topicJoin === "AND" ? " AND " : " OR ";
        return topicNames.length ? `(${topicNames.join(joiner)})` : "(empty group)";
    }).join(` ${groupJoin} `);
    let logicContainer = document.getElementById("fsv2-topic-logic-summary");
    if (logicContainer) {
        logicContainer.hidden = groups.length === 0;
        logicContainer.innerHTML = groups.length ? `
            <strong>Current logic</strong>
            <span>${escapeHtml(expression)}</span>
        ` : "";
    }
    let renderGroupNode = (group) => `
        <div
            class="fsv2-topic-builder-bubble ${group.id === window.fsV2State.activeTopicGroupId ? "fsv2-topic-builder-bubble-active" : ""}"
            data-activate-topic-group="${escapeHtml(group.id)}"
        >
            <div class="fsv2-topic-builder-bubble-head">
                <div>
                    <strong>${escapeHtml(group.label)}</strong>
                    <span>${(group.topicIds || []).length} ${(group.topicIds || []).length === 1 ? "topic" : "topics"}</span>
                </div>
                <button type="button" class="fsv2-topic-builder-remove" data-remove-topic-group="${escapeHtml(group.id)}" aria-label="Remove ${escapeHtml(group.label)}">
                    <i class="ti ti-x" aria-hidden="true"></i>
                </button>
            </div>
            <div class="fsv2-topic-builder-bubble-logic">
                <span>Match</span>
                <button type="button" data-topic-join="OR" data-topic-group-id="${escapeHtml(group.id)}" class="${group.topicJoin === "OR" ? "active" : ""}">ANY</button>
                <button type="button" data-topic-join="AND" data-topic-group-id="${escapeHtml(group.id)}" class="${group.topicJoin === "AND" ? "active" : ""}">ALL</button>
                <span>topics</span>
            </div>
            <div class="fsv2-topic-selection-pills">
                ${(group.topicIds || []).map((topicId) => topicsById.get(Number(topicId))).filter(Boolean).map((topic) => `
                <span class="fsv2-topic-selection-pill">
                    <span>${escapeHtml(topic.topic || "")}</span>
                    <button type="button" data-remove-topic-id="${Number(topic.topic_id)}" data-topic-group-id="${escapeHtml(group.id)}" aria-label="Remove ${escapeHtml(topic.topic || "")}">
                        <i class="ti ti-x" aria-hidden="true"></i>
                    </button>
                </span>
                `).join("") || '<span class="fsv2-topic-builder-bubble-empty">Select topics from the taxonomy</span>'}
            </div>
        </div>
    `;
    let groupRows = [];
    for (let index = 0; index < groups.length; index += 2) {
        groupRows.push(groups.slice(index, index + 2));
    }
    let graphHtml = groupRows.map((row, rowIndex) => {
        let reverseRow = rowIndex % 2 === 1;
        let visualRow = reverseRow ? [...row].reverse() : row;
        return `
        <div class="fsv2-topic-builder-row ${reverseRow ? "fsv2-topic-builder-row-reverse" : ""} ${row.length === 1 ? "fsv2-topic-builder-row-single" : ""}">
            ${renderGroupNode(visualRow[0])}
            ${visualRow[1] ? `
                <div class="fsv2-topic-builder-connector" aria-label="${groupJoin}">
                    <span></span><strong>${groupJoin}</strong><span></span>
                </div>
                ${renderGroupNode(visualRow[1])}
            ` : ""}
        </div>
        ${rowIndex < groupRows.length - 1 ? `
            <div class="fsv2-topic-builder-row-connector ${rowIndex % 2 === 0 ? "fsv2-topic-builder-row-connector-end" : "fsv2-topic-builder-row-connector-start"}" aria-label="${groupJoin}">
                <div>
                    <span></span><strong>${groupJoin}</strong><span></span>
                </div>
            </div>
        ` : ""}
    `;
    }).join("");

    container.innerHTML = `
        <div class="fsv2-topic-builder-head">
            <div>
                <strong>Filter builder</strong>
                <span>Select a group, then add topics from the taxonomy.</span>
            </div>
            ${groups.length > 1 ? `
                <div class="fsv2-topic-match-options" role="group" aria-label="Connect groups with">
                    <button type="button" data-topic-group-join="AND" class="fsv2-topic-match-option ${groupJoin === "AND" ? "fsv2-topic-match-option-active" : ""}">All groups</button>
                    <button type="button" data-topic-group-join="OR" class="fsv2-topic-match-option ${groupJoin === "OR" ? "fsv2-topic-match-option-active" : ""}">Any group</button>
                </div>
            ` : ""}
        </div>
        <div class="fsv2-topic-builder-flow">
            ${groups.length === 0 ? `
                <div class="fsv2-topic-builder-empty">
                    <strong>No groups yet</strong>
                    <span>Create a group, then select topics on the left.</span>
                </div>
            ` : graphHtml}
        </div>
        <button type="button" class="fsv2-topic-builder-add" data-add-topic-group>
            <i class="ti ti-plus" aria-hidden="true"></i> Add group
        </button>
    `;
}

function updateIntervalButtons() {
    document.querySelectorAll(".fsv2-interval").forEach((button) => {
        let active = button.dataset.interval === window.fsV2State.interval;
        button.classList.toggle("fsv2-interval-active", active);
    });
}

function populateTopicSelect() {
    renderTopicTree();
}

function renderTopicTree() {
    let container = document.getElementById("fsv2-topic-tree");
    if (!container) return;
    let searchValue = String(document.getElementById("fsv2-topic-search")?.value || "").trim().toLowerCase();
    let selectedIds = new Set(activeTopicGroup()?.topicIds || []);
    let openDomains = new Set(Array.from(container.querySelectorAll(".fsv2-topic-group[open]")).map((node) => node.dataset.domainKey));
    let openIndicators = new Set(Array.from(container.querySelectorAll(".fsv2-topic-subgroup[open]")).map((node) => node.dataset.indicatorKey));
    let hierarchy = topicHierarchy()
        .map((domain) => {
            let indicators = domain.indicators
                .map((indicator) => {
                    let topics = indicator.topics.filter((topic) => {
                        if (!searchValue) return true;
                        return [
                            topic.name,
                            topic.indicator,
                            topic.domain,
                        ].some((value) => String(value || "").toLowerCase().includes(searchValue));
                    });
                    return topics.length ? { ...indicator, topics } : null;
                })
                .filter(Boolean);
            return indicators.length ? { ...domain, indicators } : null;
        })
        .filter(Boolean);

    if (hierarchy.length === 0) {
        container.innerHTML = '<div class="fsv2-topic-tree-empty">No topics found.</div>';
        return;
    }

    container.innerHTML = hierarchy.map((domain) => {
        let domainKey = slugifyKey(domain.name);
        let domainOpen = searchValue ? true : openDomains.has(domainKey);
        let domainTopics = domain.indicators.flatMap((indicator) => indicator.topics);
        let domainSelectedCount = domainTopics.filter((topic) => selectedIds.has(topic.id)).length;
        let domainAllSelected = domainTopics.length > 0 && domainSelectedCount === domainTopics.length;
        let domainPartialSelected = domainSelectedCount > 0 && !domainAllSelected;
        return `
        <details class="fsv2-topic-group" data-domain-key="${domainKey}" ${domainOpen ? "open" : ""}>
            <summary>
                <span class="fsv2-topic-summary-main">
                    <input
                        type="checkbox"
                        class="fsv2-topic-group-checkbox"
                        data-select-scope="domain"
                        data-domain-key="${domainKey}"
                        ${domainAllSelected ? "checked" : ""}
                        data-partial="${domainPartialSelected ? "true" : "false"}"
                    >
                    <span>${escapeHtml(domain.name)}</span>
                    <span class="fsv2-topic-summary-count">${domainSelectedCount}/${domainTopics.length}</span>
                </span>
            </summary>
            <div class="fsv2-topic-group-body">
                ${domain.indicators.map((indicator, indicatorIndex) => {
                    let indicatorKey = `${domainKey}::${slugifyKey(indicator.name)}`;
                    let indicatorOpen = openIndicators.has(indicatorKey);
                    let indicatorSelectedCount = indicator.topics.filter((topic) => selectedIds.has(topic.id)).length;
                    let indicatorAllSelected = indicator.topics.length > 0 && indicatorSelectedCount === indicator.topics.length;
                    let indicatorPartialSelected = indicatorSelectedCount > 0 && !indicatorAllSelected;
                    return `
                    <details class="fsv2-topic-subgroup" data-indicator-key="${indicatorKey}" ${indicatorOpen ? "open" : ""}>
                        <summary>
                            <span class="fsv2-topic-summary-main">
                                <input
                                    type="checkbox"
                                    class="fsv2-topic-group-checkbox"
                                    data-select-scope="indicator"
                                    data-indicator-key="${indicatorKey}"
                                    ${indicatorAllSelected ? "checked" : ""}
                                    data-partial="${indicatorPartialSelected ? "true" : "false"}"
                                >
                                <span class="fsv2-dot" style="background:${indicatorColor(indicator.name, indicatorIndex)}"></span>
                                <span>${escapeHtml(indicator.name)}</span>
                                <span class="fsv2-topic-summary-count">${indicatorSelectedCount}/${indicator.topics.length}</span>
                            </span>
                        </summary>
                        <div class="fsv2-topic-options">
                            ${indicator.topics.map((topic) => `
                                <button
                                    type="button"
                                    class="fsv2-topic-option ${selectedIds.has(topic.id) ? "fsv2-topic-option-active" : ""}"
                                    data-topic-id="${topic.id}"
                                    data-topic-name="${escapeHtml(topic.name)}"
                                >
                                    ${escapeHtml(topic.name)}
                                </button>
                            `).join("")}
                        </div>
                    </details>
                `;
                }).join("")}
            </div>
        </details>
    `;
    }).join("");
    container.querySelectorAll(".fsv2-topic-group-checkbox[data-partial=\"true\"]").forEach((checkbox) => {
        checkbox.indeterminate = true;
    });
}

function syncControlsFromState() {
    let startDate = document.getElementById("fsv2-start-date");
    let endDate = document.getElementById("fsv2-end-date");
    if (startDate) startDate.value = toDateInputValue(window.fsV2State.overallRange.start);
    if (endDate) endDate.value = toDateInputValue(window.fsV2State.overallRange.end);
    renderTopicTree();
    updateTopicChip();
    renderSelectedTopicSummary();
    updateIntervalButtons();
    hydrateDateRangeLabel();
    updateRangePresetButtons();
    updateFilterControlsForTab();
}

function updateRangePresetButtons() {
    document.querySelectorAll(".fsv2-range-preset").forEach((button) => {
        button.classList.toggle("fsv2-range-preset-active", button.dataset.rangePreset === window.fsV2State.selectedDatePreset);
    });
}

function setFilterPanel(panelId, forceOpen = null) {
    let panelIds = ["fsv2-topic-filter-panel", "fsv2-date-filter-panel"];
    for (let id of panelIds) {
        let panel = document.getElementById(id);
        if (!panel) continue;
        if (id !== panelId) {
            panel.hidden = true;
            continue;
        }
        panel.hidden = forceOpen == null ? !panel.hidden : !forceOpen;
    }
}

function closeFilterPanels() {
    ["fsv2-topic-filter-panel", "fsv2-date-filter-panel"].forEach((id) => {
        let panel = document.getElementById(id);
        if (panel) panel.hidden = true;
    });
}

function syncWorkspaceRailHeights() {
    if (window.innerWidth <= 960) {
        document.querySelectorAll(".fsv2-feed-card").forEach((card) => {
            card.style.height = "";
        });
        document.querySelectorAll(".fsv2-workspace-rail-spacer").forEach((spacer) => {
            spacer.style.height = "";
        });
        return;
    }
    document.querySelectorAll(".fsv2-workspace").forEach((workspace) => {
        let main = workspace.querySelector(".fsv2-workspace-main .fsv2-grid");
        let feedCard = workspace.querySelector(".fsv2-feed-card");
        if (!main || !feedCard) return;
        let nextHeight = Math.ceil(main.getBoundingClientRect().height);
        let spacerHeight = 0;
        let spacer = workspace.querySelector(".fsv2-workspace-rail-spacer[data-workspace-rail-spacer]");
        if (spacer) {
            let group = spacer.dataset.workspaceRailSpacer;
            let targets = Array.from(main.querySelectorAll(`[data-rail-spacer-target="${group}"]`));
            if (targets.length === 0) {
                spacer.style.height = "0px";
            } else {
                let rowGap = parseFloat(window.getComputedStyle(main).rowGap || "0") || 0;
                let gridTop = main.getBoundingClientRect().top;
                let firstRowBottom = Math.max(...targets.map((target) => target.getBoundingClientRect().bottom));
                spacerHeight = Math.max(0, Math.ceil(firstRowBottom - gridTop + rowGap));
                spacer.style.height = `${spacerHeight}px`;
            }
        }
        if (nextHeight > 0) {
            feedCard.style.height = `${Math.max(240, nextHeight - spacerHeight)}px`;
        }
    });
}

function updateFilterControlsForTab() {
    let isSearchTab = window.fsV2State.activeTab === "search";
    let addFilterButton = document.getElementById("fsv2-add-filter-btn");
    let topicField = document.getElementById("fsv2-topic-filter-field");
    if (addFilterButton) {
        addFilterButton.hidden = isSearchTab;
    }
    if (topicField) {
        topicField.hidden = isSearchTab;
    }
    let topicSearch = document.getElementById("fsv2-topic-search");
    if (topicSearch) {
        topicSearch.disabled = isSearchTab;
    }
}

function buildConditionsFromState() {
    let groups = window.fsV2State.topicGroups || [];
    if (groups.length === 0) {
        window.fsV2State.conditions = [];
        return;
    }
    window.fsV2State.conditions = groups.flatMap((group) =>
        (group.topicIds || []).map((topicId) => ({
            field: "Topic",
            operator: "IS",
            value: Number(topicId),
            topic_group: group.id,
            topic_group_label: group.label,
            topic_join: group.topicJoin || "OR",
            topic_group_join: window.fsV2State.topicGroupJoin || "AND",
        }))
    );
}

function syncSelectedTopicsFromGroups() {
    let topicsById = new Map((window.fsV2Bootstrap?.topics || []).map((topic) => [
        Number(topic.topic_id),
        String(topic.topic || ""),
    ]));
    let selectedIds = Array.from(new Set(
        (window.fsV2State.topicGroups || []).flatMap((group) => group.topicIds || []).map(Number)
    ));
    window.fsV2State.selectedTopicIds = selectedIds;
    window.fsV2State.selectedTopicNames = selectedIds.map((topicId) => topicsById.get(topicId) || "");
    buildConditionsFromState();
}

function topicFilterStateKey() {
    let populatedGroups = (window.fsV2State.topicGroups || []).filter(
        (group) => (group.topicIds || []).length > 0
    );
    if (populatedGroups.length === 0) return "[]";
    return JSON.stringify({
        join: window.fsV2State.topicGroupJoin || "OR",
        groups: populatedGroups.map((group) => ({
            id: group.id,
            topicJoin: group.topicJoin || "OR",
            topicIds: [...(group.topicIds || [])].map(Number).sort((a, b) => a - b),
        })),
    });
}

function addTopicGroup() {
    let groupNumber = window.fsV2State.nextTopicGroupNumber || 1;
    let group = {
        id: `group:${groupNumber}`,
        label: `Group ${groupNumber}`,
        topicJoin: "OR",
        topicIds: [],
    };
    window.fsV2State.nextTopicGroupNumber = groupNumber + 1;
    window.fsV2State.topicGroups = [...(window.fsV2State.topicGroups || []), group];
    window.fsV2State.activeTopicGroupId = group.id;
    syncSelectedTopicsFromGroups();
    renderTopicTree();
    renderSelectedTopicSummary();
    updateTopicChip();
    return group;
}

function activeTopicGroup() {
    return (window.fsV2State.topicGroups || []).find(
        (group) => group.id === window.fsV2State.activeTopicGroupId
    ) || null;
}

function ensureActiveTopicGroup() {
    return activeTopicGroup() || addTopicGroup();
}

function mergeSelectedTopics(topicEntries) {
    let activeGroup = ensureActiveTopicGroup();
    let incomingIds = topicEntries.map((topic) => Number(topic.id));
    window.fsV2State.topicGroups = (window.fsV2State.topicGroups || []).map((group) =>
        group.id === activeGroup.id
            ? { ...group, topicIds: Array.from(new Set([...(group.topicIds || []), ...incomingIds])) }
            : group
    );
    syncSelectedTopicsFromGroups();
}

function removeSelectedTopicsByIds(topicIds, groupId = window.fsV2State.activeTopicGroupId) {
    let remove = new Set(topicIds.map((id) => Number(id)));
    window.fsV2State.topicGroups = (window.fsV2State.topicGroups || [])
        .map((group) => ({
            ...group,
            topicIds: group.id === groupId
                ? (group.topicIds || []).filter((topicId) => !remove.has(Number(topicId)))
                : group.topicIds,
        }));
    syncSelectedTopicsFromGroups();
}

function markTabsStale() {
    window.fsV2State.loadedTabs.summary = false;
    window.fsV2State.loadedTabs.social = false;
    window.fsV2State.loadedTabs.media = false;
    window.fsV2State.loadedTabs.search = false;
    window.fsV2State.socialTfidf = {
        period_average: null,
        daily_peak: null,
    };
    window.fsV2State.socialStaticData = null;
    window.fsV2State.mediaStaticData = null;
    window.fsV2State.searchInterestSeries = null;
    window.fsV2State.socialMessagesOffset = 0;
    window.fsV2State.socialMessagesHasMore = true;
    window.fsV2State.mediaStoriesOffset = 0;
    window.fsV2State.mediaStoriesHasMore = true;
}

function markTopicFilterStale() {
    window.fsV2State.loadedTabs.summary = false;
    window.fsV2State.loadedTabs.social = false;
    window.fsV2State.loadedTabs.media = false;
    window.fsV2State.socialStaticData = null;
    window.fsV2State.mediaStaticData = null;
    window.fsV2State.socialMessagesOffset = 0;
    window.fsV2State.socialMessagesHasMore = true;
    window.fsV2State.mediaStoriesOffset = 0;
    window.fsV2State.mediaStoriesHasMore = true;
}

function applyFilterState() {
    let startDate = document.getElementById("fsv2-start-date");
    let endDate = document.getElementById("fsv2-end-date");
    let nextStart = fromDateInputValue(startDate?.value);
    let nextEnd = fromDateInputValue(endDate?.value);
    if (!nextStart || !nextEnd || nextStart > nextEnd) {
        return;
    }
    let previousRange = { ...window.fsV2State.appliedOverallRange };
    let previousTopicFilter = window.fsV2State.appliedTopicFilterKey || "[]";
    window.fsV2State.overallRange = { start: nextStart, end: nextEnd };
    window.fsV2State.searchRange = { start: nextStart, end: nextEnd };
    buildConditionsFromState();
    let rangeChanged = previousRange.start !== nextStart || previousRange.end !== nextEnd;
    let topicsChanged = previousTopicFilter !== topicFilterStateKey();
    if (rangeChanged) {
        markTabsStale();
    } else if (topicsChanged) {
        markTopicFilterStale();
    }
    window.fsV2State.appliedOverallRange = { start: nextStart, end: nextEnd };
    window.fsV2State.appliedTopicFilterKey = topicFilterStateKey();
    syncControlsFromState();
    closeFilterPanels();
    refreshActiveTab().catch(console.error);
}

function resetFilterState() {
    window.fsV2State.topicGroups = [];
    window.fsV2State.topicGroupJoin = "AND";
    window.fsV2State.activeTopicGroupId = null;
    window.fsV2State.nextTopicGroupNumber = 1;
    window.fsV2State.selectedTopicIds = [];
    window.fsV2State.selectedTopicNames = [];
    window.fsV2State.overallRange = { ...window.fsV2State.defaultOverallRange };
    window.fsV2State.searchRange = { ...window.fsV2State.defaultOverallRange };
    window.fsV2State.selectedDatePreset = null;
    window.fsV2State.interval = "auto";
    buildConditionsFromState();
    markTabsStale();
    window.fsV2State.appliedOverallRange = { ...window.fsV2State.defaultOverallRange };
    window.fsV2State.appliedTopicFilterKey = "[]";
    syncControlsFromState();
    closeFilterPanels();
    refreshActiveTab().catch(console.error);
}

function setupFilterBar() {
    populateTopicSelect();
    syncControlsFromState();
    document.getElementById("fsv2-add-filter-btn")?.addEventListener("click", () => setFilterPanel("fsv2-topic-filter-panel"));
    document.getElementById("fsv2-date-range-btn")?.addEventListener("click", () => setFilterPanel("fsv2-date-filter-panel"));
    document.getElementById("fsv2-apply-btn")?.addEventListener("click", applyFilterState);
    document.getElementById("fsv2-reset-btn")?.addEventListener("click", resetFilterState);
    document.getElementById("fsv2-topic-search")?.addEventListener("input", () => renderTopicTree());
    document.querySelectorAll(".fsv2-range-preset").forEach((button) => {
        button.addEventListener("click", () => {
            let preset = button.dataset.rangePreset || "";
            let range = presetRange(preset);
            if (!range) return;
            window.fsV2State.selectedDatePreset = preset;
            let startDate = document.getElementById("fsv2-start-date");
            let endDate = document.getElementById("fsv2-end-date");
            if (startDate) startDate.value = toDateInputValue(range.start);
            if (endDate) endDate.value = toDateInputValue(range.end);
            updateRangePresetButtons();
        });
    });
    document.getElementById("fsv2-start-date")?.addEventListener("input", () => {
        window.fsV2State.selectedDatePreset = null;
        updateRangePresetButtons();
    });
    document.getElementById("fsv2-end-date")?.addEventListener("input", () => {
        window.fsV2State.selectedDatePreset = null;
        updateRangePresetButtons();
    });
    document.getElementById("fsv2-topic-tree")?.addEventListener("click", (event) => {
        let groupCheckbox = event.target.closest(".fsv2-topic-group-checkbox");
        if (groupCheckbox) {
            event.preventDefault();
            event.stopPropagation();
            let hierarchy = topicHierarchy();
            if (groupCheckbox.dataset.selectScope === "domain") {
                let domainKey = groupCheckbox.dataset.domainKey || "";
                let domain = hierarchy.find((item) => slugifyKey(item.name) === domainKey);
                if (!domain) return;
                let domainTopics = domain.indicators.flatMap((indicator) => indicator.topics);
                let activeIds = new Set(activeTopicGroup()?.topicIds || []);
                let allSelected = domainTopics.every((topic) => activeIds.has(Number(topic.id)));
                if (allSelected) {
                    removeSelectedTopicsByIds(domainTopics.map((topic) => topic.id));
                } else {
                    mergeSelectedTopics(domainTopics);
                }
                renderTopicTree();
                updateTopicChip();
                renderSelectedTopicSummary();
                return;
            }
            if (groupCheckbox.dataset.selectScope === "indicator") {
                let indicatorKey = groupCheckbox.dataset.indicatorKey || "";
                let match = null;
                for (let domain of hierarchy) {
                    let domainKey = slugifyKey(domain.name);
                    for (let indicator of domain.indicators) {
                        if (`${domainKey}::${slugifyKey(indicator.name)}` === indicatorKey) {
                            match = indicator;
                            break;
                        }
                    }
                    if (match) break;
                }
                if (!match) return;
                let activeIds = new Set(activeTopicGroup()?.topicIds || []);
                let allSelected = match.topics.every((topic) => activeIds.has(Number(topic.id)));
                if (allSelected) {
                    removeSelectedTopicsByIds(match.topics.map((topic) => topic.id));
                } else {
                    mergeSelectedTopics(match.topics);
                }
                renderTopicTree();
                updateTopicChip();
                renderSelectedTopicSummary();
                return;
            }
        }
        let button = event.target.closest(".fsv2-topic-option");
        if (!button) return;
        let topicId = Number(button.dataset.topicId);
        let topicName = button.dataset.topicName || button.textContent.trim();
        let activeIds = new Set(activeTopicGroup()?.topicIds || []);
        if (activeIds.has(topicId)) {
            removeSelectedTopicsByIds([topicId]);
        } else {
            mergeSelectedTopics([{ id: topicId, name: topicName }]);
        }
        renderTopicTree();
        updateTopicChip();
        renderSelectedTopicSummary();
    });
    document.getElementById("fsv2-topic-chip")?.addEventListener("click", (event) => {
        if (event.target && event.target.id === "fsv2-topic-chip-clear") {
            event.stopPropagation();
            window.fsV2State.topicGroups = [];
            window.fsV2State.topicGroupJoin = "AND";
            window.fsV2State.activeTopicGroupId = null;
            window.fsV2State.nextTopicGroupNumber = 1;
            window.fsV2State.selectedTopicIds = [];
            window.fsV2State.selectedTopicNames = [];
            buildConditionsFromState();
            markTopicFilterStale();
            window.fsV2State.appliedTopicFilterKey = "[]";
            syncControlsFromState();
            refreshActiveTab().catch(console.error);
            return;
        }
        setFilterPanel("fsv2-topic-filter-panel", true);
    });
    document.getElementById("fsv2-topic-selection-summary")?.addEventListener("click", (event) => {
        let addButton = event.target.closest("[data-add-topic-group]");
        if (addButton) {
            addTopicGroup();
            return;
        }

        let removeGroupButton = event.target.closest("[data-remove-topic-group]");
        if (removeGroupButton) {
            let groupId = removeGroupButton.dataset.removeTopicGroup;
            window.fsV2State.topicGroups = (window.fsV2State.topicGroups || []).filter(
                (group) => group.id !== groupId
            );
            if (window.fsV2State.activeTopicGroupId === groupId) {
                window.fsV2State.activeTopicGroupId = window.fsV2State.topicGroups[0]?.id || null;
            }
            syncSelectedTopicsFromGroups();
            renderTopicTree();
            renderSelectedTopicSummary();
            updateTopicChip();
            return;
        }

        let removeTopicButton = event.target.closest("[data-remove-topic-id][data-topic-group-id]");
        if (removeTopicButton) {
            removeSelectedTopicsByIds(
                [Number(removeTopicButton.dataset.removeTopicId)],
                removeTopicButton.dataset.topicGroupId
            );
            renderTopicTree();
            renderSelectedTopicSummary();
            updateTopicChip();
            return;
        }

        let topicJoinButton = event.target.closest("[data-topic-join][data-topic-group-id]");
        if (topicJoinButton) {
            let groupId = topicJoinButton.dataset.topicGroupId;
            let topicJoin = topicJoinButton.dataset.topicJoin === "AND" ? "AND" : "OR";
            window.fsV2State.topicGroups = (window.fsV2State.topicGroups || []).map((group) =>
                group.id === groupId ? { ...group, topicJoin } : group
            );
            buildConditionsFromState();
            renderSelectedTopicSummary();
            updateTopicChip();
            return;
        }

        let groupJoinButton = event.target.closest("[data-topic-group-join]");
        if (groupJoinButton) {
            window.fsV2State.topicGroupJoin = groupJoinButton.dataset.topicGroupJoin === "OR" ? "OR" : "AND";
            buildConditionsFromState();
            renderSelectedTopicSummary();
            updateTopicChip();
            return;
        }

        let groupBubble = event.target.closest("[data-activate-topic-group]");
        if (!groupBubble) return;
        window.fsV2State.activeTopicGroupId = groupBubble.dataset.activateTopicGroup;
        renderTopicTree();
        renderSelectedTopicSummary();
    });
    document.querySelectorAll(".fsv2-interval").forEach((button) => {
        button.addEventListener("click", () => {
            window.fsV2State.interval = button.dataset.interval || "auto";
            updateIntervalButtons();
            refreshActiveTab({ intervalOnly: true }).catch(console.error);
        });
    });
}

function switchTab(panel) {
    window.fsV2State.activeTab = panel;
    document.querySelectorAll(".fsv2-tab[data-panel]").forEach((button) => {
        button.classList.toggle("fsv2-tab-active", button.dataset.panel === panel);
    });
    document.querySelectorAll(".fsv2-tab-panel[data-panel]").forEach((section) => {
        section.hidden = section.dataset.panel !== panel;
    });
    updateFilterControlsForTab();
    updateTopicChip();
}

function setupTabs() {
    document.querySelectorAll(".fsv2-tab[data-panel]").forEach((button) => {
        button.addEventListener("click", () => {
            let nextPanel = button.dataset.panel || "summary";
            switchTab(nextPanel);
            if (!window.fsV2State.loadedTabs[nextPanel]) {
                refreshActiveTab().catch(console.error);
            }
        });
    });
}

function setupTfidfToggle() {
    document.querySelectorAll(".fsv2-pill-toggle-btn[data-tfidf-metric]").forEach((button) => {
        button.addEventListener("click", () => {
            let nextMetric = button.dataset.tfidfMetric || "period_average";
            if (window.fsV2State.tfidfMetric === nextMetric) return;
            window.fsV2State.tfidfMetric = nextMetric;
            document.querySelectorAll(".fsv2-pill-toggle-btn[data-tfidf-metric]").forEach((item) => {
                item.classList.toggle("fsv2-pill-toggle-btn-active", item.dataset.tfidfMetric === nextMetric);
            });
            if (window.fsV2State.activeTab === "social") {
                if (window.fsV2State.socialTfidf?.[nextMetric]) {
                    renderCurrentTfidf();
                    syncSocialTopRow();
                } else {
                    loadSocialListening().catch(console.error);
                }
            }
        });
    });
}

function baseChartOptions(height) {
    let colors = chartColors();
    let chart = {
        styledMode: false,
        backgroundColor: "transparent",
        plotBackgroundColor: "transparent",
        spacingTop: 10,
        spacingRight: 10,
        spacingBottom: 10,
        spacingLeft: 10,
        style: {
            fontFamily: '"Open Sans", "Segoe UI", sans-serif',
        },
    };
    if (height != null) {
        chart.height = height;
    }
    return {
        chart,
        title: { text: null },
        credits: { enabled: false },
        exporting: { enabled: false },
        legend: {
            enabled: false,
        },
        xAxis: {
            type: "datetime",
            lineColor: colors.grid,
            tickColor: colors.grid,
            gridLineWidth: 0,
            labels: {
                style: { color: colors.text, fontSize: "10px" },
            },
        },
        yAxis: {
            title: { text: null },
            gridLineColor: colors.grid,
            lineWidth: 0,
            labels: {
                style: { color: colors.text, fontSize: "10px" },
            },
        },
        tooltip: {
            shared: true,
            useHTML: true,
            backgroundColor: "rgba(255,255,255,0.96)",
            borderColor: colors.grid,
            borderRadius: 8,
            shadow: false,
        },
        navigator: { enabled: false },
        rangeSelector: { enabled: false },
        scrollbar: { enabled: false },
    };
}

function renderCoverageChart(containerId, payload, streamKey) {
    let container = document.getElementById(containerId);
    if (!container) return;
    let data = payload?.data || [];
    registerVisualization(containerId, {
        containerId,
        fileStem: `${streamKey}-corpus-coverage`,
        csvRows: data.map((point) => ({
            date: formatIsoDate(point.date),
            collected_records: Number(point.all_records || 0),
            human_mobility_records: Number(point.hm_records || 0),
            human_mobility_coverage_pct: point.hm_coverage == null ? null : Number((point.hm_coverage * 100).toFixed(2)),
        })),
    });
    let meaningful = data.filter((point) => Number(point.all_records || 0) > 0 || Number(point.hm_records || 0) > 0);
    if (meaningful.length === 0) {
        container.innerHTML = '<div class="fsv2-coverage-empty">No data in selected period</div>';
        return;
    }
    let colors = chartColors();
    let recordLabel = streamRecordLabel(streamKey);
    let base = baseChartOptions();
    Highcharts.chart(containerId, {
        ...base,
        chart: {
            ...base.chart,
            type: "column",
            zoomType: "x",
            spacingTop: 8,
            spacingRight: 8,
            spacingBottom: 8,
            spacingLeft: 8,
            marginLeft: 62,
            marginRight: 70,
            marginTop: 8,
            marginBottom: 28,
        },
        xAxis: {
            type: "datetime",
            lineColor: colors.grid,
            tickColor: colors.grid,
            tickLength: 0,
            tickPixelInterval: payload.interval === "month" ? 72 : 96,
            labels: {
                style: { color: colors.text, fontSize: "10px" },
                formatter: function () {
                    return payload.interval === "month"
                        ? Highcharts.dateFormat("%b '%y", this.value)
                        : Highcharts.dateFormat("%e %b", this.value);
                },
            },
        },
        yAxis: [{
            min: 0,
            title: {
                text: "Records",
                reserveSpace: true,
                margin: 14,
                style: { color: colors.text, fontSize: "10px" },
            },
            labels: {
                style: { color: colors.text, fontSize: "10px" },
                formatter: function () {
                    return Highcharts.numberFormat(this.value, 0);
                },
            },
            gridLineColor: colors.grid,
            tickLength: 0,
        }, {
            min: 0,
            max: 100,
            opposite: true,
            title: {
                text: "human mobility coverage",
                reserveSpace: true,
                margin: 14,
                style: { color: colors.text, fontSize: "10px" },
            },
            labels: {
                style: { color: colors.text, fontSize: "10px" },
                format: "{value}%",
            },
            gridLineWidth: 0,
            tickLength: 0,
        }],
        tooltip: {
            ...base.tooltip,
            shared: true,
            xDateFormat: payload.interval === "month" ? "%b %Y" : "%e %b %Y",
        },
        legend: { enabled: false },
        plotOptions: {
            column: {
                grouping: false,
                borderWidth: 0,
                groupPadding: 0.08,
            },
            series: {
                animation: false,
                states: { hover: { enabled: true } },
            },
            line: {
                lineWidth: 2,
                marker: { enabled: false, radius: 2 },
            },
        },
        series: [{
            type: "column",
            className: "fsv2-coverage-total",
            name: `Collected ${recordLabel}`,
            color: "rgba(136, 135, 128, 0.28)",
            data: data.map((point) => [point.date, Number(point.all_records || 0)]),
            tooltip: { valueDecimals: 0 },
        }, {
            type: "column",
            className: streamKey === "tg" ? "fsv2-coverage-filtered-tg" : "fsv2-coverage-filtered-mc",
            name: `human mobility ${recordLabel}`,
            color: streamKey === "tg" ? colors.tg : colors.mc,
            data: data.map((point) => [point.date, Number(point.hm_records || 0)]),
            pointPadding: 0.2,
            tooltip: { valueDecimals: 0 },
        }, {
            type: "line",
            className: "fsv2-coverage-ratio",
            name: "human mobility coverage",
            color: colors.amber,
            yAxis: 1,
            data: data.map((point) => [point.date, point.hm_coverage == null ? null : point.hm_coverage * 100]),
            zIndex: 3,
            tooltip: { valueSuffix: "%", valueDecimals: 1 },
        }],
    });
}

function renderCoverageKpi(prefix, payload, recordLabel, streamKey) {
    let summary = payload?.summary;
    if (!summary) {
        setUnavailable(prefix, recordLabel);
        return;
    }
    let hasData = Number(summary.all_records || 0) > 0 || Number(summary.hm_records || 0) > 0;
    setText(`${prefix}-kpi-value`, formatCount(summary.hm_records));
    let comparison = formatSignedPercentChange(summary.hm_records, summary.previous_hm_records);
    setHTML(
        `${prefix}-kpi-label`,
        hasData
            ? `${recordLabel}${comparison === "N/A" ? "" : ` <span class="${(summary.hm_records >= (summary.previous_hm_records || 0)) ? "fsv2-up" : "fsv2-down"}">${comparison}</span>`}`
            : `No ${streamKey === "mc" ? "MediaCloud" : "Telegram"} data in selected period`
    );
    let coverageText = formatPercent(summary.hm_coverage);
    let deltaText = formatSignedPointChange(summary.hm_coverage_change_pp);
    setHTML(
        `${prefix}-kpi-meta`,
        hasData
            ? `Total collected: <strong>${formatCount(summary.all_records)}</strong> · Coverage: <strong>${coverageText}</strong>${deltaText === "N/A" ? "" : ` <span class="${(summary.hm_coverage_change_pp || 0) >= 0 ? "fsv2-up" : "fsv2-down"}">${deltaText}</span>`}`
            : `No records available for the current date range`
    );
    renderCoverageChart(`${prefix}-kpi-chart`, payload, streamKey);
}

function renderMultiSeriesLineChart(containerId, series, options) {
    let colors = chartColors();
    let filteredSeries = (series || []).filter((entry) => Array.isArray(entry.data) && entry.data.length > 0);
    if (filteredSeries.length === 0) {
        let container = document.getElementById(containerId);
        if (container) container.innerHTML = '<div class="fsv2-chart-empty">No data available</div>';
        return;
    }
    Highcharts.chart(containerId, {
        ...baseChartOptions(options.height || 240),
        xAxis: {
            ...baseChartOptions(options.height || 240).xAxis,
            tickPixelInterval: 90,
        },
        yAxis: {
            ...baseChartOptions(options.height || 240).yAxis,
            min: options.min,
            max: options.max,
            startOnTick: true,
            endOnTick: true,
            labels: {
                style: { color: colors.text, fontSize: "10px" },
                formatter: options.labelFormatter,
            },
        },
        legend: {
            enabled: false,
        },
        tooltip: {
            shared: true,
            xDateFormat: "%e %b %Y",
            pointFormatter: function () {
                let suffix = options.valueSuffix || "";
                let decimals = options.decimals ?? 2;
                return `<span style="color:${this.color}">\u25cf</span> ${this.series.name}: <b>${Highcharts.numberFormat(this.y, decimals)}${suffix}</b><br/>`;
            },
        },
        plotOptions: {
            series: {
                animation: false,
                marker: { enabled: false },
                lineWidth: 2.2,
            },
        },
        series: filteredSeries.map((entry) => ({
            type: "line",
            name: entry.name,
            color: options.colorMap?.[entry.name] || colors.tg,
            dashStyle: options.dashMap?.[entry.name] || "Solid",
            data: entry.data.map((point) => [point.date, point.value]),
        })),
    });
}

function renderAnomalyChart(containerId, series) {
    let colors = chartColors();
    let filteredSeries = (series || []).filter((entry) => Array.isArray(entry.data) && entry.data.length > 0);
    if (filteredSeries.length === 0) {
        let container = document.getElementById(containerId);
        if (container) container.innerHTML = '<div class="fsv2-chart-empty">No data available</div>';
        return;
    }
    Highcharts.chart(containerId, {
        ...baseChartOptions(240),
        xAxis: {
            ...baseChartOptions(240).xAxis,
            tickPixelInterval: 90,
        },
        yAxis: {
            ...baseChartOptions(240).yAxis,
            min: 0,
            allowDecimals: false,
        },
        tooltip: {
            shared: true,
            xDateFormat: "%e %b %Y",
            pointFormatter: function () {
                return `<span style="color:${this.color}">\u25cf</span> ${this.series.name}: <b>${Highcharts.numberFormat(this.y, 0)}</b><br/>`;
            },
        },
        plotOptions: {
            column: {
                animation: false,
                borderWidth: 0,
                pointPadding: 0.08,
                groupPadding: 0.12,
                borderRadius: 2,
            },
        },
        series: filteredSeries.map((entry) => ({
            type: "column",
            name: entry.name,
            color: entry.name === "Social" ? colors.tg : colors.mc,
            data: entry.data.map((point) => [point.date, point.value]),
        })),
    });
}

function reshapeAttentionSeries(payload) {
    let rows = payload?.data || [];
    let bySeries = new Map();
    let nameKey = rows.some((row) => row.topic_name) ? "topic_name" : "indicator_name";
    for (let row of rows) {
        let seriesName = row[nameKey];
        if (!seriesName) continue;
        if (!bySeries.has(seriesName)) {
            bySeries.set(seriesName, []);
        }
        bySeries.get(seriesName).push({
            date: Number(row.date),
            value: row.value == null ? null : Number(row.value),
        });
    }
    return Array.from(bySeries.entries()).map(([name, data]) => ({
        name,
        data,
    }));
}

function updateAttentionCardCopy(containerId, payload) {
    let container = document.getElementById(containerId);
    let subtitle = container?.closest(".fsv2-card")?.querySelector(".fsv2-card-head p");
    if (!subtitle) return;
    let isTelegram = !(containerId.includes("-mc-") || containerId.includes("media"));
    let isTopicMode = (window.fsV2State.selectedTopicIds || []).length > 0;
    if (isTelegram) {
        subtitle.textContent = isTopicMode
            ? "Selected topic share within human mobility messages · scale 0–1"
            : "Human mobility indicator share within messages · scale 0–1";
        return;
    }
    subtitle.textContent = isTopicMode
        ? "Selected topic share within human mobility news stories · scale 0–1"
        : "Human mobility indicator share within news stories · scale 0–1";
}

function updateSentimentCardCopy() {
    let tgSubtitle = document.querySelector("#fsv2-sentiment-tg-chart")?.closest(".fsv2-card")?.querySelector(".fsv2-card-head p");
    let mcSubtitle = document.querySelector("#fsv2-sentiment-mc-chart")?.closest(".fsv2-card")?.querySelector(".fsv2-card-head p");
    if (tgSubtitle) {
        tgSubtitle.textContent = "Sentiment score · scale -1 to 1";
    }
    if (mcSubtitle) {
        mcSubtitle.textContent = "Sentiment score · scale -1 to 1";
    }
}

function updateAnomalyCardCopy() {
    let tgSubtitle = document.querySelector("#fsv2-anomaly-tg-chart")?.closest(".fsv2-card")?.querySelector(".fsv2-card-head p");
    let mcSubtitle = document.querySelector("#fsv2-anomaly-mc-chart")?.closest(".fsv2-card")?.querySelector(".fsv2-card-head p");
    let hasTopicFilter = (window.fsV2State.selectedTopicIds || []).length > 0;
    if (tgSubtitle) {
        tgSubtitle.textContent = hasTopicFilter
            ? "Count of anomalous filtered topics within human mobility messages"
            : "Count of anomalous topics · Telegram";
    }
    if (mcSubtitle) {
        mcSubtitle.textContent = hasTopicFilter
            ? "Count of anomalous filtered topics within human mobility news stories"
            : "Count of anomalous topics · News media";
    }
}

function filterSeriesByName(series, seriesName) {
    return (series || []).filter((entry) => entry.name === seriesName);
}

function reshapeIndicatorAnomalySeries(payload) {
    let rows = payload?.data || [];
    let byIndicator = new Map();
    for (let row of rows) {
        if (!row.indicator_name) continue;
        if (!byIndicator.has(row.indicator_name)) {
            byIndicator.set(row.indicator_name, []);
        }
        byIndicator.get(row.indicator_name).push({
            date: Number(row.date),
            value: row.value == null ? 0 : Number(row.value),
            topic_names: row.topic_names || [],
            topic_ids: row.topic_ids || [],
        });
    }
    return Array.from(byIndicator.entries()).map(([name, data]) => ({
        name,
        data,
    }));
}

function renderIndicatorAttentionChart(containerId, payload) {
    let container = document.getElementById(containerId);
    if (!container) return;
    let colors = chartColors();
    let series = reshapeAttentionSeries(payload);
    let hasTopicFilter = (window.fsV2State.selectedTopicIds || []).length > 0;
    let useTopicPalette = hasTopicFilter && (
        containerId === "fsv2-social-attention-chart" || containerId === "fsv2-media-attention-chart"
    );
    let stream = containerId === "fsv2-media-attention-chart" ? "mc" : "tg";
    let distributionColors = window.fsV2State.topicColorMaps?.[stream] || {};
    registerVisualization(containerId, {
        containerId,
        fileStem: `${containerId}-attention`,
        csvRows: (payload?.data || []).map((row) => ({
            date: formatIsoDate(row.date),
            topic_name: row.topic_name || "",
            indicator_name: row.indicator_name || "",
            value: row.value == null ? null : Number(row.value),
        })),
    });
    updateAttentionCardCopy(containerId, payload);
    let filteredSeries = series.filter((entry) => entry.data.some((point) => point.value != null));
    if (filteredSeries.length === 0) {
        container.innerHTML = `
            <div class="fsv2-attention-empty">
                <strong>No data available</strong>
                <span>No matching human mobility attention series were available for this stream in the selected period.</span>
            </div>
        `;
        return;
    }
    let base = baseChartOptions();
    let legendAtTop = true;
    Highcharts.chart(containerId, {
        ...base,
        chart: {
            ...base.chart,
            height: null,
            spacingTop: 8,
            spacingRight: 10,
            spacingBottom: 30,
            spacingLeft: 10,
            marginTop: legendAtTop ? 46 : 8,
            marginBottom: 44,
            marginLeft: 78,
            marginRight: 18,
        },
        xAxis: {
            ...base.xAxis,
            tickPixelInterval: payload?.interval === "month" ? 72 : payload?.interval === "week" ? 84 : 96,
            tickLength: 0,
        },
        yAxis: {
            ...base.yAxis,
            min: 0,
            max: 1.25,
            startOnTick: true,
            endOnTick: true,
            tickPositions: [0, 0.25, 0.5, 0.75, 1.0, 1.25],
            gridLineColor: colors.grid,
            title: {
                text: "human mobility attention share",
                reserveSpace: true,
                margin: 18,
                rotation: 270,
                style: { color: colors.text, fontSize: "10px" },
            },
            labels: {
                style: { color: colors.text, fontSize: "10px" },
                formatter: function () {
                    return this.value === 1.25 ? "" : this.value.toFixed(1);
                },
            },
        },
        legend: {
            enabled: true,
            align: "left",
            verticalAlign: legendAtTop ? "top" : "bottom",
            layout: "horizontal",
            margin: legendAtTop ? 8 : 12,
            y: legendAtTop ? 0 : 0,
            itemStyle: { color: colors.text, fontSize: "11px", fontWeight: "normal" },
            itemHoverStyle: { color: colors.dark },
            symbolRadius: 0,
        },
        tooltip: {
            ...base.tooltip,
            shared: true,
            xDateFormat: payload?.interval === "month" ? "%b %Y" : payload?.interval === "week" ? "Week of %e %b %Y" : "%e %b %Y",
            pointFormatter: function () {
                return `<span style="color:${this.color}">\u25cf</span> ${this.series.name}: <b>${Highcharts.numberFormat(this.y, 2)}</b><br/>`;
            },
        },
        plotOptions: {
            series: {
                animation: false,
                connectNulls: false,
                marker: {
                    enabled: false,
                    states: { hover: { enabled: false } },
                },
                lineWidth: 2,
                states: { hover: { lineWidthPlus: 0 } },
            },
        },
        series: filteredSeries.map((entry, index) => ({
            type: "spline",
            name: entry.name,
            color: useTopicPalette
                ? distributionColors[normalizeIndicatorName(entry.name)] || topicPaletteColor(entry.name, index)
                : indicatorColor(entry.name, index),
            data: entry.data.map((point) => [point.date, point.value]),
        })),
    });
}

function renderSentimentTrendChart(containerId, series) {
    let container = document.getElementById(containerId);
    if (!container) return;
    updateSentimentCardCopy();
    let colors = chartColors();
    let filteredSeries = (series || []).filter((entry) => Array.isArray(entry.data) && entry.data.length > 0);
    registerVisualization(containerId, {
        containerId,
        fileStem: `${containerId}-sentiment`,
        csvRows: flattenNamedSeries(filteredSeries, (name) => (
            name === "Social" ? "Telegram" : name === "Media" ? "News media" : name
        )),
    });
    if (filteredSeries.length === 0) {
        container.innerHTML = `
            <div class="fsv2-trend-empty">
                <strong>No data available</strong>
                <span>No sentiment records were available in the selected period.</span>
            </div>
        `;
        return;
    }
    let base = baseChartOptions();
    let resolvedInterval = resolveIntervalForRange(
        window.fsV2State.overallRange.start,
        window.fsV2State.overallRange.end,
        window.fsV2State.interval
    );
    Highcharts.chart(containerId, {
        ...base,
        chart: {
            ...base.chart,
            type: "column",
            height: null,
            spacingTop: 8,
            spacingRight: 10,
            spacingBottom: 20,
            spacingLeft: 10,
            marginTop: 8,
            marginBottom: 28,
            marginLeft: 78,
            marginRight: 18,
        },
        xAxis: {
            ...base.xAxis,
            tickPixelInterval: resolvedInterval === "month" ? 72 : resolvedInterval === "week" ? 84 : 90,
            tickLength: 0,
        },
        yAxis: {
            ...base.yAxis,
            min: -1,
            max: 1,
            tickPositions: [-1, -0.5, 0, 0.5, 1],
            startOnTick: true,
            endOnTick: true,
            plotLines: [{
                value: 0,
                color: colors.grid,
                width: 1,
                zIndex: 3,
            }],
            gridLineColor: colors.grid,
            title: {
                text: "Sentiment score",
                reserveSpace: true,
                margin: 18,
                rotation: 270,
                style: { color: colors.text, fontSize: "10px" },
            },
            labels: {
                style: { color: colors.text, fontSize: "10px" },
                formatter: function () { return this.value.toFixed(1); },
            },
        },
        legend: {
            enabled: false,
        },
        tooltip: {
            ...base.tooltip,
            shared: true,
            xDateFormat: resolvedInterval === "month"
                ? "%b %Y"
                : resolvedInterval === "week"
                    ? "Week of %e %b %Y"
                    : "%e %b %Y",
            pointFormatter: function () {
                return `<span style="color:${this.color}">\u25cf</span> ${this.series.name}: <b>${Highcharts.numberFormat(this.y, 2)}</b><br/>`;
            },
        },
        plotOptions: {
            column: {
                animation: false,
                borderWidth: 0,
                groupPadding: 0.12,
                pointPadding: 0.08,
                borderRadius: 1,
            },
            series: {
                animation: false,
                states: { hover: { enabled: true } },
            },
        },
        series: filteredSeries.map((entry) => ({
            type: "column",
            name: entry.name === "Social" ? "Telegram" : entry.name === "Media" ? "News media" : entry.name,
            color: entry.name === "Social" ? colors.tg : colors.mc,
            data: entry.data.map((point) => [point.date, point.value]),
        })),
    });
}

function renderAnomalyTrendChart(containerId, series) {
    let container = document.getElementById(containerId);
    if (!container) return;
    updateAnomalyCardCopy();
    let colors = chartColors();
    let filteredSeries = reshapeIndicatorAnomalySeries(series)
        .filter((entry) => Array.isArray(entry.data) && entry.data.some((point) => Number(point.value || 0) > 0))
        .sort((a, b) => Number(isHumanMobilityIndicator(a.name)) - Number(isHumanMobilityIndicator(b.name)));
    registerVisualization(containerId, {
        containerId,
        fileStem: `${containerId}-anomalies`,
        csvRows: filteredSeries.flatMap((entry) => (entry.data || []).map((point) => ({
            indicator: entry.name,
            date: formatIsoDate(point.date),
            anomalous_topics: Number(point.value || 0),
            topic_names: Array.isArray(point.topic_names) ? point.topic_names.join("; ") : "",
        }))),
    });
    if (filteredSeries.length === 0) {
        let isTelegram = containerId.includes("-tg-");
        container.innerHTML = `
            <div class="fsv2-trend-empty">
                <strong>No data available</strong>
                <span>${isTelegram
                    ? "No anomalous topics within human mobility messages were available in the selected period."
                    : "No anomalous topics within human mobility stories were available in the selected period."}</span>
            </div>
        `;
        return;
    }
    let base = baseChartOptions();
    let resolvedInterval = series?.interval || resolveIntervalForRange(
        window.fsV2State.overallRange.start,
        window.fsV2State.overallRange.end,
        window.fsV2State.interval
    );
    Highcharts.chart(containerId, {
        ...base,
        chart: {
            ...base.chart,
            type: "column",
            height: null,
            spacingTop: 8,
            spacingRight: 10,
            spacingBottom: 20,
            spacingLeft: 10,
            marginTop: 8,
            marginBottom: 28,
            marginLeft: 78,
            marginRight: 18,
        },
        xAxis: {
            ...base.xAxis,
            tickPixelInterval: resolvedInterval === "month" ? 72 : resolvedInterval === "week" ? 84 : 90,
            tickLength: 0,
        },
        yAxis: {
            ...base.yAxis,
            min: 0,
            allowDecimals: false,
            startOnTick: true,
            endOnTick: true,
            gridLineColor: colors.grid,
            title: {
                text: "Anomalous topics",
                reserveSpace: true,
                margin: 18,
                rotation: 270,
                style: { color: colors.text, fontSize: "10px" },
            },
            labels: {
                style: { color: colors.text, fontSize: "10px" },
                formatter: function () { return Highcharts.numberFormat(this.value, 0); },
            },
        },
        legend: {
            enabled: false,
        },
        tooltip: {
            ...base.tooltip,
            shared: true,
            useHTML: true,
            xDateFormat: resolvedInterval === "month" ? "%b %Y" : resolvedInterval === "week" ? "Week of %e %b %Y" : "%e %b %Y",
            pointFormatter: function () {
                if (Number(this.y) === 0) return "";
                let topics = Array.isArray(this.topic_names) ? this.topic_names : [];
                let topicsHtml = topics.length
                    ? `<br/><span style="color:#888780">Topics:</span> ${topics.join(", ")}`
                    : "";
                return `<span style="color:${this.color}">\u25cf</span> ${this.series.name}: <b>${Highcharts.numberFormat(this.y, 0)}</b>${topicsHtml}<br/>`;
            },
        },
        plotOptions: {
            column: {
                animation: false,
                borderWidth: 0,
                pointPadding: 0.08,
                groupPadding: 0.12,
                borderRadius: 2,
                stacking: "normal",
            },
            series: {
                states: { hover: { enabled: true } },
            },
        },
        series: filteredSeries.map((entry, index) => ({
            type: "column",
            name: entry.name,
            color: indicatorColor(entry.name, index),
            data: entry.data.map((point) => ({
                x: point.date,
                y: point.value,
                topic_names: point.topic_names || [],
            })),
        })),
    });
}

function renderSearchInterestChart(containerId, series) {
    let container = document.getElementById(containerId);
    if (!container) return;
    let colors = chartColors();
    let resolvedInterval = resolveIntervalForRange(
        window.fsV2State.searchRange.start,
        window.fsV2State.searchRange.end,
        window.fsV2State.interval
    );
    let searchInterestPalette = {
        Displacement: colors.tg,
        Migration: colors.alert,
        Refugees: colors.violet,
    };
    let filteredSeries = aggregateSeriesByInterval(series || [], resolvedInterval)
        .filter((entry) => Array.isArray(entry.data) && entry.data.length > 0);
    registerVisualization(containerId, {
        containerId,
        fileStem: `${containerId}-search-interest`,
        rangeKind: "search",
        csvRows: flattenNamedSeries(filteredSeries),
    });
    if (filteredSeries.length === 0) {
        container.innerHTML = `
            <div class="fsv2-trend-empty">
                <strong>No data available</strong>
                <span>No displacement, refugees, or migration search-interest series were available in the selected period.</span>
            </div>
        `;
        return;
    }
    let base = baseChartOptions();
    Highcharts.chart(containerId, {
        ...base,
        chart: {
            ...base.chart,
            height: null,
            spacingTop: 8,
            spacingRight: 10,
            spacingBottom: 20,
            spacingLeft: 10,
            marginTop: 8,
            marginBottom: 28,
            marginLeft: 78,
            marginRight: 18,
        },
        xAxis: {
            ...base.xAxis,
            tickPixelInterval: resolvedInterval === "month" ? 72 : resolvedInterval === "week" ? 84 : 90,
            tickLength: 0,
        },
        yAxis: {
            ...base.yAxis,
            min: 0,
            max: 100,
            tickPositions: [0, 25, 50, 75, 100],
            startOnTick: true,
            endOnTick: true,
            gridLineColor: colors.grid,
            title: {
                text: "Search interest",
                reserveSpace: true,
                margin: 18,
                rotation: 270,
                style: { color: colors.text, fontSize: "10px" },
            },
            labels: {
                style: { color: colors.text, fontSize: "10px" },
                formatter: function () { return Highcharts.numberFormat(this.value, 0); },
            },
        },
        legend: {
            enabled: false,
        },
        tooltip: {
            ...base.tooltip,
            shared: true,
            xDateFormat: resolvedInterval === "month" ? "%b %Y" : resolvedInterval === "week" ? "Week of %e %b %Y" : "%e %b %Y",
            pointFormatter: function () {
                return `<span style="color:${this.color}">\u25cf</span> ${this.series.name}: <b>${Highcharts.numberFormat(this.y, 0)}</b><br/>`;
            },
        },
        plotOptions: {
            series: {
                animation: false,
                connectNulls: false,
                marker: {
                    enabled: false,
                    states: { hover: { enabled: false } },
                },
                lineWidth: 2,
                states: { hover: { lineWidthPlus: 0 } },
            },
        },
        series: filteredSeries.map((entry) => ({
            type: "spline",
            name: entry.name,
            color: searchInterestPalette[entry.name] || colors.mc,
            data: entry.data.map((point) => [point.date, point.value]),
        })),
    });
}

function extractSeriesMap(points) {
    if (!Array.isArray(points) || points.length === 0) return [];
    let sortedPoints = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let keys = Object.keys(sortedPoints[0]).filter((key) => key !== "date");
    return keys.map((key) => ({
        name: key,
        data: sortedPoints.map((point) => ({
            date: new Date(point.date).getTime(),
            value: point[key],
        })).filter((point) => point.value != null),
    }));
}

function renderSocialSummaryKpis(payload) {
    let summary = payload || {};
    let hasTopicFilter = (window.fsV2State.selectedTopicIds || []).length > 0;
    let hmCoverage = (summary.total_messages && summary.hm_messages != null)
        ? summary.hm_messages / summary.total_messages
        : null;
    setText("fsv2-social-kpi-messages-value", formatCount(summary.hm_messages));
    setHTML(
        "fsv2-social-kpi-messages-label",
        hasTopicFilter ? "Filtered human mobility messages in selected period" : "human mobility messages in selected period"
    );
    setHTML(
        "fsv2-social-kpi-messages-meta",
        summary.hm_messages == null
            ? "Telegram summary unavailable"
            : `Coverage: <strong>${formatPercent(hmCoverage, 1)}</strong> · <span class="${(summary.hm_messages || 0) >= (summary.previous_hm_messages || 0) ? "fsv2-up" : "fsv2-down"}">${formatSignedPercentChange(summary.hm_messages, summary.previous_hm_messages)}</span>`
    );

    setText("fsv2-social-kpi-channels-value", formatCount(summary.active_channels));
    setHTML("fsv2-social-kpi-channels-label", "Active Telegram channels in selected period");
    setHTML(
        "fsv2-social-kpi-channels-meta",
        summary.active_channels == null
            ? "Telegram summary unavailable"
            : `Tracked channels total: <strong>${formatCount(summary.total_channels)}</strong> · <span class="${(summary.active_channels || 0) >= (summary.previous_active_channels || 0) ? "fsv2-up" : "fsv2-down"}">${formatSignedPercentChange(summary.active_channels, summary.previous_active_channels)}</span>`
    );

    setText(
        "fsv2-social-kpi-sentiment-value",
        summary.average_sentiment == null ? "N/A" : Number(summary.average_sentiment).toFixed(2)
    );
    setHTML("fsv2-social-kpi-sentiment-label", "Mean sentiment in matched human mobility messages");
    setHTML(
        "fsv2-social-kpi-sentiment-meta",
        summary.average_sentiment == null
            ? "No sentiment records available"
            : `<span class="${(summary.average_sentiment || 0) >= (summary.previous_average_sentiment || 0) ? "fsv2-up" : "fsv2-down"}">${formatSignedValueChange(summary.average_sentiment, summary.previous_average_sentiment, 2)} vs prev. period</span>`
    );

    setText(
        "fsv2-social-kpi-indicators-value",
        summary.active_indicators == null ? "0" : `${summary.active_indicators}/6`
    );
    setHTML(
        "fsv2-social-kpi-indicators-label",
        hasTopicFilter
            ? "Indicators active in filtered messages"
            : "Human mobility indicators active in matched messages"
    );
    setHTML(
        "fsv2-social-kpi-indicators-meta",
        `Distinct human mobility topics present: <strong>${formatCount(summary.active_topics)}</strong>`
    );
}

function renderMediaSummaryKpis(payload) {
    let summary = payload || {};
    let hasTopicFilter = (window.fsV2State.selectedTopicIds || []).length > 0;
    let hmCoverage = (summary.total_stories && summary.hm_stories != null)
        ? summary.hm_stories / summary.total_stories
        : null;
    setText("fsv2-media-kpi-stories-value", formatCount(summary.hm_stories));
    setHTML(
        "fsv2-media-kpi-stories-label",
        hasTopicFilter ? "Filtered human mobility stories in selected period" : "human mobility stories in selected period"
    );
    setHTML(
        "fsv2-media-kpi-stories-meta",
        summary.hm_stories == null
            ? "News media summary unavailable"
            : `Coverage: <strong>${formatPercent(hmCoverage, 1)}</strong> · <span class="${(summary.hm_stories || 0) >= (summary.previous_hm_stories || 0) ? "fsv2-up" : "fsv2-down"}">${formatSignedPercentChange(summary.hm_stories, summary.previous_hm_stories)}</span>`
    );

    setText("fsv2-media-kpi-sources-value", formatCount(summary.active_sources));
    setHTML("fsv2-media-kpi-sources-label", "Active configured Sudan sources in selected period");
    setHTML(
        "fsv2-media-kpi-sources-meta",
        summary.active_sources == null
            ? "News media summary unavailable"
            : `Tracked sources total: <strong>${formatCount(summary.total_sources)}</strong> · <span class="${(summary.active_sources || 0) >= (summary.previous_active_sources || 0) ? "fsv2-up" : "fsv2-down"}">${formatSignedPercentChange(summary.active_sources, summary.previous_active_sources)}</span>`
    );

    setText(
        "fsv2-media-kpi-sentiment-value",
        summary.average_sentiment == null ? "N/A" : Number(summary.average_sentiment).toFixed(2)
    );
    setHTML("fsv2-media-kpi-sentiment-label", "Mean sentiment in matched human mobility stories");
    setHTML(
        "fsv2-media-kpi-sentiment-meta",
        summary.average_sentiment == null
            ? "No sentiment records available"
            : `<span class="${(summary.average_sentiment || 0) >= (summary.previous_average_sentiment || 0) ? "fsv2-up" : "fsv2-down"}">${formatSignedValueChange(summary.average_sentiment, summary.previous_average_sentiment, 2)} vs prev. period</span>`
    );

    setText(
        "fsv2-media-kpi-indicators-value",
        summary.active_indicators == null ? "0" : `${summary.active_indicators}/6`
    );
    setHTML(
        "fsv2-media-kpi-indicators-label",
        hasTopicFilter
            ? "Indicators active in filtered stories"
            : "Human mobility indicators active in matched stories"
    );
    setHTML(
        "fsv2-media-kpi-indicators-meta",
        `Distinct human mobility topics present: <strong>${formatCount(summary.active_topics)}</strong>`
    );
}

function currentTfidfRows() {
    return window.fsV2State.socialTfidf?.[window.fsV2State.tfidfMetric] || [];
}

function syncSocialTopRow() {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (window.fsV2State.socialStaticData?.domainRanking) {
                renderDomainComparisonChart("fsv2-social-domain-chart", window.fsV2State.socialStaticData.domainRanking, "tg");
            }
        });
    });
}

function syncMediaTopRow() {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (window.fsV2State.mediaStaticData?.domainRanking) {
                renderDomainComparisonChart("fsv2-media-domain-chart", window.fsV2State.mediaStaticData.domainRanking, "mc");
            }
        });
    });
}

function renderCurrentTfidf() {
    let rows = currentTfidfRows();
    let pills = document.getElementById("fsv2-social-tfidf-pills");
    let chart = document.getElementById("fsv2-social-tfidf-chart");
    let subtitle = pills?.closest(".fsv2-card")?.querySelector(".fsv2-card-head p");
    if (subtitle) {
        subtitle.textContent = window.fsV2State.tfidfMetric === "daily_peak"
            ? "Top 50 distinctive term peaks in human mobility messages for the selected period"
            : "Top 50 distinctive terms in human mobility messages for the selected period";
    }
    registerVisualization("fsv2-social-tfidf", {
        containerId: "fsv2-social-tfidf-pills",
        fileStem: `social-significant-terms-${window.fsV2State.tfidfMetric}`,
        csvRows: rows.map((row) => ({
            lemma: row.lemma || "",
            mean_value: row.mean_value == null ? null : Number(row.mean_value),
            overall_rank: row.overall_rank == null ? null : Number(row.overall_rank),
            date_id: row.date_id || "",
        })),
    });
    if (window.fsV2State.tfidfMetric === "daily_peak") {
        if (pills) pills.hidden = true;
        if (chart) chart.hidden = false;
        renderTfidfDailyPeakChart("fsv2-social-tfidf-chart", rows);
    } else {
        if (chart) chart.hidden = true;
        if (pills) pills.hidden = false;
        renderTfidfPills("fsv2-social-tfidf-pills", rows);
    }
    renderTfidfNote();
}

function normalizeTelegramUsername(value) {
    let raw = String(value || "").trim();
    if (!raw) return "";
    raw = raw.replace(/^https?:\/\/t\.me\//i, "");
    raw = raw.replace(/^@/, "");
    raw = raw.replace(/\/+$/, "");
    return raw;
}

function componentPillStyle(component) {
    let indicator = component?.indicator_name || "";
    let domain = String(component?.domain_name || "").toLowerCase();
    if (domain === "human mobility") {
        let color = indicatorColor(indicator);
        return `background:${color}1A;border-color:${color}4D;color:${color};`;
    }
    return "";
}

function componentPillsHtml(components) {
    return components.map((component) => {
        let matchedTerms = Array.isArray(component.matched_terms) ? component.matched_terms : [];
        let payload = matchedTerms.length ? escapeHtml(JSON.stringify({
            title: component.component_name || "Matched terms",
            subtitle: component.indicator_name || component.domain_name || "",
            body: matchedTerms.join("\n"),
        })) : "";
        return `
            <button
                type="button"
                class="fsv2-topic-pill fsv2-topic-pill-button ${String(component.domain_name || "").toLowerCase() === "human mobility" ? "fsv2-topic-pill-hm" : "fsv2-topic-pill-nonhm"}"
                style="${componentPillStyle(component)}"
                title="${escapeHtml(component.indicator_name || component.domain_name || "")}${matchedTerms.length ? " · Click to view matched terms" : ""}"
                ${matchedTerms.length ? `data-message-dialog="${payload}"` : ""}
            >
                ${escapeHtml(component.component_name || "")}
            </button>
        `;
    }).join("");
}

function componentTextListHtml(components, visibleCount = 4) {
    return components.slice(0, visibleCount).map((component) => {
        let matchedTerms = Array.isArray(component.matched_terms) ? component.matched_terms : [];
        let payload = matchedTerms.length ? escapeHtml(JSON.stringify({
            title: component.component_name || "Matched terms",
            subtitle: component.indicator_name || component.domain_name || "",
            body: matchedTerms.join("\n"),
        })) : "";
        let isHumanMobility = normalizeIndicatorName(component.domain_name) === "human mobility";
        let textClass = `fsv2-message-topic-text ${isHumanMobility ? "fsv2-message-topic-text-hm" : ""}`;
        let textStyle = isHumanMobility ? ` style="color:${indicatorColor(component.indicator_name)}"` : "";
        let topicText = matchedTerms.length
            ? `<button type="button" class="${textClass} fsv2-topic-pill-button"${textStyle} data-message-dialog="${payload}">${escapeHtml(component.component_name || "")}</button>`
            : `<span class="${textClass}"${textStyle}>${escapeHtml(component.component_name || "")}</span>`;
        return `
            <span class="fsv2-message-topic-text-item">
                ${topicText}
            </span>
        `;
    }).join("");
}

function ensureMessageDialog() {
    let dialog = document.getElementById("fsv2-message-dialog");
    if (dialog) return dialog;
    let wrapper = document.createElement("dialog");
    wrapper.id = "fsv2-message-dialog";
    wrapper.className = "fsv2-message-dialog";
    wrapper.innerHTML = `
        <div class="fsv2-message-dialog-card">
            <div class="fsv2-message-dialog-head">
                <div>
                    <strong id="fsv2-message-dialog-title">Message</strong>
                    <div class="fsv2-message-dialog-sub" id="fsv2-message-dialog-sub"></div>
                </div>
                <button type="button" class="fsv2-message-dialog-close" id="fsv2-message-dialog-close" aria-label="Close">
                    <i class="ti ti-x" aria-hidden="true"></i>
                </button>
            </div>
            <div class="fsv2-message-dialog-body" id="fsv2-message-dialog-body"></div>
        </div>
    `;
    document.body.appendChild(wrapper);
    wrapper.addEventListener("click", (event) => {
        if (event.target === wrapper) wrapper.close();
    });
    wrapper.querySelector("#fsv2-message-dialog-close")?.addEventListener("click", () => wrapper.close());
    wrapper.addEventListener("close", () => {
        document.body.classList.remove("fsv2-dialog-open");
    });
    return wrapper;
}

function openMessageDialog(payload) {
    let dialog = ensureMessageDialog();
    closeMatchedTermsPopover();
    dialog.querySelector("#fsv2-message-dialog-title").textContent = payload.title || "Message";
    dialog.querySelector("#fsv2-message-dialog-sub").textContent = payload.subtitle || "";
    dialog.querySelector("#fsv2-message-dialog-body").textContent = payload.body || "";
    document.body.classList.add("fsv2-dialog-open");
    dialog.showModal();
}

function ensureMessageTopicsPopover() {
    let popover = document.getElementById("fsv2-message-topics-popover");
    if (popover) return popover;
    popover = document.createElement("div");
    popover.id = "fsv2-message-topics-popover";
    popover.className = "fsv2-matched-terms-popover fsv2-message-topics-popover";
    popover.hidden = true;
    document.body.appendChild(popover);
    return popover;
}

function closeMessageTopicsPopover() {
    let popover = document.getElementById("fsv2-message-topics-popover");
    if (!popover) return;
    popover.hidden = true;
    popover.innerHTML = "";
    delete popover.dataset.anchorId;
    delete popover.dataset.components;
}

function renderMessageTopicsPopover(popover, components, detail = null) {
    if (detail) {
        let terms = Array.isArray(detail.matched_terms) ? detail.matched_terms : [];
        popover.innerHTML = `
            <div class="fsv2-matched-terms-popover-arrow" aria-hidden="true"></div>
            <button type="button" class="fsv2-message-topics-back">
                <i class="ti ti-arrow-left" aria-hidden="true"></i> All topics
            </button>
            <div class="fsv2-matched-terms-popover-head">
                <strong>${escapeHtml(detail.component_name || "Matched terms")}</strong>
                <span>${escapeHtml(detail.indicator_name || detail.domain_name || "")}</span>
            </div>
            <div class="fsv2-matched-terms-popover-list">
                ${terms.length
                    ? terms.map((term) => `<span class="fsv2-matched-terms-token">${escapeHtml(term)}</span>`).join("")
                    : '<span class="fsv2-message-topic-no-terms">No matched terms available</span>'}
            </div>
        `;
        return;
    }

    popover.innerHTML = `
        <div class="fsv2-matched-terms-popover-arrow" aria-hidden="true"></div>
        <div class="fsv2-matched-terms-popover-head">
            <strong>Topics in this message</strong>
            <span>${components.length} detected topics · Select one to view matched terms</span>
        </div>
        <div class="fsv2-message-topics-popover-list">
            ${components.map((component) => {
                let isHumanMobility = normalizeIndicatorName(component.domain_name) === "human mobility";
                let color = isHumanMobility ? indicatorColor(component.indicator_name) : "#888780";
                return `
                    <button
                        type="button"
                        class="fsv2-message-topic-popover-item"
                        style="--fsv2-topic-color:${color}"
                        data-topic-detail="${escapeHtml(JSON.stringify(component))}"
                    >
                        <span>${escapeHtml(component.component_name || "")}</span>
                        <small>${escapeHtml(component.indicator_name || component.domain_name || "")}</small>
                    </button>
                `;
            }).join("")}
        </div>
    `;
}

function openMessageTopicsPopover(anchor, components) {
    let popover = ensureMessageTopicsPopover();
    if (!anchor.id) anchor.id = `fsv2-topics-${Math.random().toString(36).slice(2, 10)}`;
    if (!popover.hidden && popover.dataset.anchorId === anchor.id) {
        closeMessageTopicsPopover();
        return;
    }
    closeMatchedTermsPopover();
    popover.dataset.anchorId = anchor.id;
    popover.dataset.components = JSON.stringify(components);
    renderMessageTopicsPopover(popover, components);
    popover.hidden = false;
    positionMatchedTermsPopover(anchor, popover);
}

function ensureMatchedTermsPopover() {
    let popover = document.getElementById("fsv2-matched-terms-popover");
    if (popover) return popover;
    popover = document.createElement("div");
    popover.id = "fsv2-matched-terms-popover";
    popover.className = "fsv2-matched-terms-popover";
    popover.hidden = true;
    document.body.appendChild(popover);
    return popover;
}

function closeMatchedTermsPopover() {
    let popover = document.getElementById("fsv2-matched-terms-popover");
    if (!popover) return;
    popover.hidden = true;
    popover.innerHTML = "";
    delete popover.dataset.anchorId;
}

function openMatchedTermsPopover(anchor, payload) {
    let popover = ensureMatchedTermsPopover();
    let terms = String(payload.body || "")
        .split("\n")
        .map((term) => term.trim())
        .filter(Boolean);
    if (terms.length === 0) {
        closeMatchedTermsPopover();
        return;
    }
    if (!anchor.id) {
        anchor.id = `fsv2-pill-${Math.random().toString(36).slice(2, 10)}`;
    }
    if (!popover.hidden && popover.dataset.anchorId === anchor.id) {
        closeMatchedTermsPopover();
        return;
    }
    popover.dataset.anchorId = anchor.id;
    popover.innerHTML = `
        <div class="fsv2-matched-terms-popover-arrow" aria-hidden="true"></div>
        <div class="fsv2-matched-terms-popover-head">
            <strong>${escapeHtml(payload.title || "Matched terms")}</strong>
            ${payload.subtitle ? `<span>${escapeHtml(payload.subtitle)}</span>` : ""}
        </div>
        <div class="fsv2-matched-terms-popover-list">
            ${terms.map((term) => `<span class="fsv2-matched-terms-token">${escapeHtml(term)}</span>`).join("")}
        </div>
    `;
    popover.hidden = false;
    positionMatchedTermsPopover(anchor, popover);
}

function positionMatchedTermsPopover(anchor, popover = null) {
    let target = popover || document.getElementById("fsv2-matched-terms-popover");
    if (!target || target.hidden || !anchor) return;
    let rect = anchor.getBoundingClientRect();
    let margin = 12;
    let width = Math.min(320, window.innerWidth - margin * 2);
    target.style.width = `${width}px`;
    target.style.maxWidth = `${width}px`;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    target.style.left = `${left}px`;
    target.style.top = "0px";
    let popoverRect = target.getBoundingClientRect();
    let top = rect.bottom + 8;
    let placement = "bottom";
    if (top + popoverRect.height > window.innerHeight - margin) {
        top = rect.top - popoverRect.height - 8;
        placement = "top";
    }
    top = Math.max(margin, top);
    target.style.top = `${top}px`;
    target.dataset.placement = placement;
    let arrowLeft = rect.left + rect.width / 2 - left;
    target.style.setProperty("--fsv2-popover-arrow-left", `${Math.max(18, Math.min(width - 18, arrowLeft))}px`);
}

function renderTalkingPoints(containerId, rows, ensureHumanMobilityIndicators = false) {
    let container = document.getElementById(containerId);
    if (!container) return;
    let normalizedRows = Array.isArray(rows) ? [...rows] : [];
    if (ensureHumanMobilityIndicators) {
        let humanMobilityDomain = topicHierarchy().find(
            (domain) => normalizeIndicatorName(domain.name) === "human mobility"
        );
        let existing = new Set(normalizedRows.map((row) => normalizeIndicatorName(row.domain)));
        for (let indicator of humanMobilityDomain?.indicators || []) {
            if (existing.has(normalizeIndicatorName(indicator.name))) continue;
            normalizedRows.push(
                { domain: indicator.name, layer: "attention", latest_value: 0, prev_value: 0 },
                { domain: indicator.name, layer: "sentiment", latest_value: null, prev_value: null },
            );
        }
    }
    registerVisualization(containerId, {
        containerId,
        fileStem: `${containerId}-talking-points`,
        csvRows: normalizedRows.map((row) => ({
            domain: row.domain || "",
            layer: row.layer || "",
            latest_value: row.latest_value == null ? null : Number(row.latest_value),
            prev_value: row.prev_value == null ? null : Number(row.prev_value),
        })),
    });
    if (normalizedRows.length === 0) {
        container.innerHTML = `
            <div class="fsv2-trend-empty">
                <strong>No data available</strong>
                <span>No talking-point indicators were available in the selected period.</span>
            </div>
        `;
        return;
    }

    let mapped = new Map();
    for (let row of normalizedRows) {
        if (!mapped.has(row.domain)) {
            mapped.set(row.domain, { domain: row.domain });
        }
        mapped.get(row.domain)[row.layer] = row;
    }
    let ordered = Array.from(mapped.values()).sort((a, b) => {
        let av = a.attention?.latest_value ?? -1;
        let bv = b.attention?.latest_value ?? -1;
        return bv - av;
    });

    container.innerHTML = `
        <div class="fsv2-talking-points">
            ${ordered.map((entry) => {
                let attention = entry.attention || {};
                let sentiment = entry.sentiment || {};
                let attentionDelta = attention.latest_value === 0 && attention.prev_value === 0
                    ? ""
                    : formatSignedPercentChange(attention.latest_value, attention.prev_value);
                let hasSentiment = sentiment.latest_value != null;
                let sentimentValue = attention.latest_value === 0
                    ? "N/A"
                    : hasSentiment ? Number(sentiment.latest_value).toFixed(2) : "";
                let sentimentDelta = hasSentiment && attention.latest_value !== 0
                    ? formatSignedValueChange(sentiment.latest_value, sentiment.prev_value, 2)
                    : "";
                return `
                    <div class="fsv2-tp-row">
                        <div class="fsv2-tp-indicator">
                        <div class="fsv2-tp-indicator-label">
                            <span class="fsv2-dot" style="background:${indicatorColor(entry.domain)}"></span>
                            <strong>${escapeHtml(entry.domain)}</strong>
                        </div>
                        <div class="fsv2-tp-indicator-sub">Human mobility indicator</div>
                    </div>
                        <div class="fsv2-tp-metric">
                            <span class="fsv2-tp-metric-label">Attention</span>
                            <div class="fsv2-tp-metric-value">
                                <span class="fsv2-tp-current">${formatPercent(attention.latest_value, 1)}</span>
                                <span class="fsv2-tp-delta ${(attention.latest_value || 0) >= (attention.prev_value || 0) ? "fsv2-up" : "fsv2-down"}">${attentionDelta}</span>
                            </div>
                        </div>
                        <div class="fsv2-tp-metric">
                            <span class="fsv2-tp-metric-label">Sentiment</span>
                            <div class="fsv2-tp-metric-value">
                                <span class="fsv2-tp-current">${sentimentValue}</span>
                                <span class="fsv2-tp-delta ${(sentiment.latest_value || 0) >= (sentiment.prev_value || 0) ? "fsv2-up" : "fsv2-down"}">${sentimentDelta}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function renderDomainComparisonChart(containerId, payload, stream) {
    let container = document.getElementById(containerId);
    if (!container) return;
    let rows = Array.isArray(payload) ? payload : payload?.data || [];
    let knownDomains = new Set(topicHierarchy().map((domain) => normalizeIndicatorName(domain.name)));
    let displayRows = rows
        .map((row) => ({
            label: row.domain || row.topic || "",
            value: row.frequency == null ? null : Number(row.frequency),
        }))
        .filter((row) => row.label && row.value != null)
        .filter((row) => normalizeIndicatorName(row.label) !== "human mobility")
        .sort((a, b) => {
            let aHm = normalizeIndicatorName(a.label) === "human mobility";
            let bHm = normalizeIndicatorName(b.label) === "human mobility";
            if (aHm && !bHm) return -1;
            if (!aHm && bHm) return 1;
            return b.value - a.value;
        })
        .slice(0, 8);
    let hasTopicFilter = (window.fsV2State.selectedTopicIds || []).length > 0;
    let isDomainMode = !hasTopicFilter
        && displayRows.length > 0
        && displayRows.every((row) => knownDomains.has(normalizeIndicatorName(row.label)));

    let cardHead = container.closest(".fsv2-card")?.querySelector(".fsv2-card-head");
    let title = cardHead?.querySelector("h2");
    let subtitle = cardHead?.querySelector("p");
    if (title) {
        title.textContent = hasTopicFilter
            ? "Distribution of selected topics"
            : "Distribution of analytical domains";
    }
    if (subtitle) {
        if (stream === "tg") {
            subtitle.textContent = hasTopicFilter
                ? "Share of human mobility messages tagged to the selected topics during the selected period (up to 8 most frequent topics shown)"
                : "Share of human mobility messages tagged to each domain during the selected period (up to 8 most frequent domains shown)";
        } else {
            subtitle.textContent = hasTopicFilter
                ? "Share of human mobility news stories tagged to the selected topics during the selected period (up to 8 most frequent topics shown)"
                : "Share of human mobility news stories tagged to each domain during the selected period (up to 8 most frequent domains shown)";
        }
    }
    registerVisualization(containerId, {
        containerId,
        fileStem: `${containerId}-domain-comparison`,
        csvRows: displayRows.map((row) => ({
            label: row.label,
            share: row.value,
        })),
    });

    if (displayRows.length === 0) {
        window.fsV2State.topicColorMaps = window.fsV2State.topicColorMaps || { tg: {}, mc: {} };
        window.fsV2State.topicColorMaps[stream] = {};
        container.innerHTML = `
            <div class="fsv2-domain-empty">
                <strong>No data available</strong>
                <span>No matching domain prevalence was available in the selected period.</span>
            </div>
        `;
        return;
    }

    let colors = chartColors();
    let colorForRow = (row, index) => {
        if (isDomainMode) {
            return domainColor(row.label, index);
        }
        let palette = domainPalette();
        return palette[index % palette.length];
    };
    let rowColors = displayRows.map((row, index) => colorForRow(row, index));
    window.fsV2State.topicColorMaps = window.fsV2State.topicColorMaps || { tg: {}, mc: {} };
    window.fsV2State.topicColorMaps[stream] = isDomainMode
        ? {}
        : Object.fromEntries(displayRows.map((row, index) => [
            normalizeIndicatorName(row.label),
            rowColors[index],
        ]));
    let base = baseChartOptions(null);

    Highcharts.chart(containerId, {
        ...base,
        colors: rowColors,
        chart: {
            ...base.chart,
            type: "bar",
            events: {
                render: function () {
                    let chart = this;
                    let labelText = "Share of human mobility records (%)";
                    let y = chart.chartHeight - 8;
                    let x = chart.plotLeft + (chart.plotWidth / 2);
                    if (!chart.customBottomAxisTitle) {
                        chart.customBottomAxisTitle = chart.renderer
                            .text(labelText, x, y)
                            .css({
                                color: colors.text,
                                fontSize: "10px",
                            })
                            .attr({ align: "center", zIndex: 7 })
                            .add();
                    } else {
                        chart.customBottomAxisTitle.attr({ text: labelText, x, y });
                    }
                },
            },
            spacingTop: 8,
            spacingRight: 10,
            spacingBottom: 8,
            spacingLeft: 10,
            marginTop: 8,
            marginBottom: 48,
            marginLeft: 132,
            marginRight: 24,
        },
        xAxis: {
            categories: displayRows.map((row) => row.label),
            lineColor: colors.grid,
            tickColor: colors.grid,
            tickLength: 0,
            labels: {
                style: { color: colors.text, fontSize: "11px" },
            },
        },
        yAxis: {
            min: 0,
            max: Math.max(1, ...displayRows.map((row) => row.value)),
            endOnTick: true,
            tickAmount: 5,
            gridLineColor: colors.grid,
            title: { text: null },
            labels: {
                style: { color: colors.text, fontSize: "10px" },
                formatter: function () {
                    return `${Math.round(this.value * 100)}%`;
                },
            },
        },
        legend: { enabled: false },
        tooltip: {
            ...base.tooltip,
            shared: false,
            pointFormatter: function () {
                return `<span style="color:${this.color}">\u25cf</span> ${escapeHtml(this.category)}: <b>${formatPercent(this.y, 1)}</b><br/>`;
            },
        },
        plotOptions: {
            bar: {
                animation: false,
                borderWidth: 0,
                // Let Highcharts size each bar from its category band. A fixed
                // point width made the eight rows collide in shorter cards.
                pointPadding: 0.16,
                groupPadding: 0.12,
                borderRadius: 3,
                dataLabels: {
                    enabled: true,
                    inside: false,
                    crop: false,
                    overflow: "allow",
                    formatter: function () {
                        return formatPercent(this.y, 1);
                    },
                    style: {
                        color: colors.text,
                        fontSize: "10px",
                        fontWeight: "600",
                        textOutline: "none",
                    },
                },
            },
            series: {
                animation: false,
                states: { hover: { enabled: true } },
            },
        },
        series: [{
            type: "bar",
            name: isDomainMode ? "Domains" : "Topics",
            colorByPoint: true,
            data: displayRows.map((row, index) => ({
                y: row.value,
                color: rowColors[index],
            })),
        }],
    });
}

function correlationHeatmapColor(value) {
    let numericValue = Math.max(-1, Math.min(1, Number(value) || 0));
    let ratio = Math.abs(numericValue);
    let start = [238, 243, 247];
    let end = numericValue < 0 ? [55, 138, 221] : [29, 92, 56];
    let rgb = start.map((channel, index) => Math.round(channel + (end[index] - channel) * ratio));
    return `rgb(${rgb.join(", ")})`;
}

function renderDomainCorrelationMatrix(containerId, payload, stream) {
    let container = document.getElementById(containerId);
    if (!container) return;
    let topics = Array.isArray(payload?.domains) ? payload.domains : [];
    let matrix = Array.isArray(payload?.matrix) ? payload.matrix : [];
    let matrixByPosition = new Map(matrix.map((cell) => [`${cell.x}:${cell.y}`, cell]));
    let streamLabel = stream === "tg" ? "messages" : "stories";

    registerVisualization(containerId, {
        containerId,
        fileStem: `${containerId}-phi-correlation`,
        csvRows: matrix.map((cell) => ({
            node_a: topics[cell.x]?.name || "",
            node_b: topics[cell.y]?.name || "",
            phi: cell.value,
            both_count: cell.both_count,
            total_records: cell.total_records,
        })),
    });

    if (topics.length < 2) {
        container.innerHTML = `
            <div class="fsv2-topic-heatmap-empty">
                <strong>No association data available</strong>
                <span>Human Mobility indicators and analytical domains were not available in the selected ${streamLabel}.</span>
            </div>
        `;
        return;
    }

    let columnTemplate = `180px repeat(${topics.length}, minmax(28px, 1fr))`;
    let cells = ['<div></div>'];
    for (let topic of topics) {
        let nodeClass = topic.type === "indicator" ? "indicator" : "domain";
        cells.push(`<div class="fsv2-topic-heatmap-label fsv2-topic-heatmap-label-top fsv2-topic-heatmap-label-${nodeClass}" title="${escapeHtml(topic.name)}">${escapeHtml(topic.name)}</div>`);
    }
    for (let y = 0; y < topics.length; y += 1) {
        let rowTopic = topics[y];
        let rowNodeClass = rowTopic.type === "indicator" ? "indicator" : "domain";
        cells.push(`<div class="fsv2-topic-heatmap-label fsv2-topic-heatmap-label-side fsv2-topic-heatmap-label-${rowNodeClass}" title="${escapeHtml(rowTopic.name)}">${escapeHtml(rowTopic.name)}</div>`);
        for (let x = 0; x < topics.length; x += 1) {
            let cell = matrixByPosition.get(`${x}:${y}`) || { value: 0, both_count: 0, union_count: 0 };
        let coefficient = cell.value == null ? "N/A" : Number(cell.value).toFixed(2);
        let diagonal = x === y ? " fsv2-topic-heatmap-cell-diagonal" : "";
            let title = `${rowTopic.name} + ${topics[x].name}: φ = ${coefficient} · ${cell.both_count || 0} of ${cell.total_records || 0} records contain both`;
            cells.push(`<div class="fsv2-topic-heatmap-cell${diagonal}" style="background:${correlationHeatmapColor(cell.value)}" title="${escapeHtml(title)}">${coefficient}</div>`);
        }
    }

    container.innerHTML = `
        <div class="fsv2-topic-heatmap-grid" style="grid-template-columns:${columnTemplate}">${cells.join("")}</div>
        <div class="fsv2-topic-heatmap-legend" aria-label="Phi correlation scale">
            <span>Negative</span>
            <span class="fsv2-topic-heatmap-legend-scale"></span>
            <span>Positive</span>
            <span>· ${formatCount(payload.total_records)} ${streamLabel} in scope</span>
        </div>
    `;
}

function renderTemporalCorrelation(containerId, payload) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!payload || payload.days < 30) {
        container.innerHTML = `<strong>Daily attention movement unavailable</strong><br>Temporal correlation requires at least 30 days in the selected period.`;
        return;
    }
    container.innerHTML = `<div class="fsv2-temporal-head"><strong>Daily attention movement</strong><span>${payload.days} days</span><button class="fsv2-temporal-info" type="button" aria-expanded="false" title="How this matrix is calculated">i</button><div class="fsv2-temporal-toggle"><button class="is-active" data-mode="levels">Daily prevalence</button><button data-mode="changes">Daily changes</button></div></div><div class="fsv2-temporal-popover" hidden><nav><button class="is-active" data-section="method">What it measures</button><button data-section="prevalence">Prevalence</button><button data-section="changes">Changes</button></nav><div class="fsv2-temporal-popover-body"><section data-section-panel="method"><h3>What this analysis measures</h3><p>Each day is treated as one observation. For every indicator or domain, we count how many in-scope messages or stories mention it. The matrix then compares the resulting daily attention patterns.</p><p>Here, a <b>node</b> means one item being compared: either a Human Mobility indicator or an analytical domain.</p><p>This is different from the phi matrix: phi measures whether two topics occur in the same record, while this analysis measures whether their attention is high or low during the same days.</p></section><section data-section-panel="prevalence" hidden><h3>Daily prevalence matrix</h3><ol><li>For day <i>t</i>, <i>n<sub>t</sub></i> is the number of in-scope records and <i>c<sub>k,t</sub></i> is the number containing item <i>k</i>.</li><li>We calculate the share of records containing the item. A small smoothing correction gives <span class="fsv2-math">p&#771;<sub>k,t</sub> = (c<sub>k,t</sub> + 0.5) / (n<sub>t</sub> + 1)</span>, so empty or fully classified days do not create infinite values.</li><li>We use the logit scale <span class="fsv2-math">z<sub>k,t</sub> = log(p&#771;<sub>k,t</sub> / (1 - p&#771;<sub>k,t</sub>))</span> to make relative changes in rare and common items more comparable.</li><li>Each cell is Pearson's <span class="fsv2-math">r(z<sub>i,t</sub>, z<sub>j,t</sub>)</span> across the selected days. Positive values mean the items tend to be prominent on the same days.</li></ol></section><section data-section-panel="changes" hidden><h3>Daily changes matrix</h3><ol><li>We start from the same logit series used in the prevalence matrix.</li><li>For each item, we calculate its day-to-day movement: <span class="fsv2-math">&#916;z<sub>k,t</sub> = z<sub>k,t</sub> - z<sub>k,t-1</sub></span>.</li><li>Each cell is Pearson's <span class="fsv2-math">r(&#916;z<sub>i,t</sub>, &#916;z<sub>j,t</sub>)</span> across consecutive days. Positive values mean the two items tend to rise and fall together, regardless of their baseline attention.</li></ol></section></div></div><div class="fsv2-temporal-grid"></div>`;
    const infoButton = container.querySelector(".fsv2-temporal-info");
    const infoBox = container.querySelector(".fsv2-temporal-popover");
    infoButton.addEventListener("click", () => {
        const expanded = infoButton.getAttribute("aria-expanded") === "true";
        infoButton.setAttribute("aria-expanded", String(!expanded));
        infoBox.hidden = expanded;
    });
    container.querySelectorAll(".fsv2-temporal-popover nav button").forEach(button => button.addEventListener("click", () => {
        const section = button.dataset.section;
        container.querySelectorAll(".fsv2-temporal-popover nav button").forEach(item => item.classList.toggle("is-active", item === button));
        container.querySelectorAll("[data-section-panel]").forEach(panel => { panel.hidden = panel.dataset.sectionPanel !== section; });
    }));
    container.querySelectorAll(".fsv2-temporal-toggle button").forEach(button => button.addEventListener("click", () => {
        container.querySelectorAll("button").forEach(item => item.classList.toggle("is-active", item === button));
        renderTemporalHeatmap(container.querySelector(".fsv2-temporal-grid"), payload, button.dataset.mode);
    }));
    renderTemporalHeatmap(container.querySelector(".fsv2-temporal-grid"), payload, "levels");
}

function renderTemporalHeatmap(container, payload, mode) {
    const nodes = payload.nodes || [];
    const cells = new Map((payload[mode] || []).map(cell => [`${cell.x}:${cell.y}`, cell]));
    const labels = nodes.map(node => escapeHtml(node.name));
    const labelStyle = node => {
        const type = node.label_type || node.type;
        if (type === "indicator") {
            const background = indicatorColor(node.name);
            const hex = background.slice(1);
            const red = parseInt(hex.slice(0, 2), 16);
            const green = parseInt(hex.slice(2, 4), 16);
            const blue = parseInt(hex.slice(4, 6), 16);
            const text = (red * 299 + green * 587 + blue * 114) / 1000 > 155 ? "#000" : "#fff";
            return `background:${background};color:${text};border-color:${background};`;
        }
        if (type === "human_mobility_domain") {
            return "background:var(--fsv2-nav);color:#fff;border-color:var(--fsv2-nav);";
        }
        return "background:#fff;color:#000;border-color:var(--fsv2-border);";
    };
    let html = `<div class="fsv2-temporal-matrix" style="grid-template-columns:120px repeat(${nodes.length}, minmax(34px, 1fr))"><div></div>`;
    labels.forEach((label, index) => { html += `<div class="fsv2-temporal-label top fsv2-temporal-label-${nodes[index].label_type || nodes[index].type}" style="${labelStyle(nodes[index])}">${label}</div>`; });
    nodes.forEach((node, y) => {
        html += `<div class="fsv2-temporal-label side fsv2-temporal-label-${nodes[y].label_type || nodes[y].type}" style="${labelStyle(nodes[y])}">${labels[y]}</div>`;
        nodes.forEach((_, x) => {
            const cell = cells.get(`${x}:${y}`) || {};
            const value = cell.value == null ? "N/A" : Number(cell.value).toFixed(2);
            html += `<div class="fsv2-topic-heatmap-cell${x === y ? " fsv2-topic-heatmap-cell-diagonal" : ""}${x === y ? "" : " fsv2-correlation-cell-clickable"}" data-correlation-x="${x}" data-correlation-y="${y}" style="background:${correlationHeatmapColor(cell.value)}" title="${escapeHtml(`${nodes[y].name} / ${nodes[x].name}: ${value}`)}">${value}</div>`;
        });
    });
    container.innerHTML = `${html}</div><div class="fsv2-topic-heatmap-legend"><span>Negative</span><span class="fsv2-topic-heatmap-legend-scale"></span><span>Positive</span></div>`;
    container.querySelectorAll(".fsv2-correlation-cell-clickable").forEach(cell => cell.addEventListener("click", () => showCorrelationScatter(payload, Number(cell.dataset.correlationX), Number(cell.dataset.correlationY), mode)));
}

function showCorrelationScatter(payload, x, y, mode) {
    document.querySelector(".fsv2-correlation-popover")?.remove();
    document.querySelector(".fsv2-correlation-backdrop")?.remove();
    const seriesMode = mode === "raw_changes" || mode === "changes" ? "changes" : "levels";
    const xValues = payload.series?.[seriesMode]?.[x] || [];
    const yValues = payload.series?.[seriesMode]?.[y] || [];
    const periods = payload.periods || [];
    const points = xValues.map((value, index) => ({ x: value, y: yValues[index], period: payload.period_labels?.[index] || formatCorrelationPeriod(periods[index]) })).filter(point => Number.isFinite(point.y));
    const minX = Math.min(...points.map(point => point.x), 0); const maxX = Math.max(...points.map(point => point.x), 0); const minY = Math.min(...points.map(point => point.y), 0); const maxY = Math.max(...points.map(point => point.y), 0);
    const width = 560, height = 340, left = 64, right = 20, top = 20, bottom = 58;
    const scaleX = value => left + ((value - minX) / (maxX - minX || 1)) * (width - left - right);
    const scaleY = value => height - bottom - ((value - minY) / (maxY - minY || 1)) * (height - top - bottom);
    const circles = points.map((point, index) => { const cx = scaleX(point.x); const cy = scaleY(point.y); return `<circle class="fsv2-scatter-point" data-index="${index}" cx="${cx}" cy="${cy}" r="5" fill="#16866b"></circle>`; }).join("");
    const ticks = (min, max, axis) => Array.from({length: 5}, (_, index) => {
        const value = min + (max - min) * index / 4;
        if (axis === "x") { const px = scaleX(value); return `<line x1="${px}" y1="${height-bottom}" x2="${px}" y2="${height-bottom+4}" /><text x="${px}" y="${height-bottom+17}" text-anchor="middle">${value.toFixed(2)}</text>`; }
        const py = scaleY(value); return `<line x1="${left-4}" y1="${py}" x2="${left}" y2="${py}" /><text x="${left-8}" y="${py+3}" text-anchor="end">${value.toFixed(2)}</text>`;
    }).join("");
    const correlationCell = (payload[mode === "raw_changes" || mode === "changes" ? "raw_changes" : "raw_levels"] || payload[mode] || []).find(cell => cell.x === x && cell.y === y);
    const correlation = correlationCell?.value == null ? "N/A" : Number(correlationCell.value).toFixed(2);
    const backdrop = document.createElement("div"); backdrop.className = "fsv2-correlation-backdrop";
    const popover = document.createElement("div"); popover.className = "fsv2-correlation-popover";
    popover.innerHTML = `<div class="fsv2-correlation-popover-head"><div><strong>${escapeHtml(payload.nodes[x].name)} vs ${escapeHtml(payload.nodes[y].name)}</strong><span>Correlation: <b>${correlation}</b></span></div><button type="button" aria-label="Close">×</button></div><p>${seriesMode === "changes" ? "Changes between consecutive aggregated periods" : "Raw prevalence in each aggregated period"} · ${payload.aggregation}</p><div class="fsv2-scatter-wrap"><svg viewBox="0 0 ${width} ${height}" role="img"><line x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}" /><line x1="${left}" y1="${height-bottom}" x2="${left}" y2="${top}" />${ticks(minX,maxX,"x")}${ticks(minY,maxY,"y")}${circles}<text x="${(left + width - right) / 2}" y="${height - 12}" text-anchor="middle">${escapeHtml(payload.nodes[x].name)}</text><text x="16" y="${(top + height-bottom) / 2}" text-anchor="middle" transform="rotate(-90 16 ${(top + height-bottom) / 2})">${escapeHtml(payload.nodes[y].name)}</text></svg><div class="fsv2-scatter-tooltip" hidden></div></div><div class="fsv2-correlation-axis">Each point represents one ${payload.aggregation} period. Hover a point for its date and values.</div>`;
    const tooltip = popover.querySelector(".fsv2-scatter-tooltip");
    popover.querySelectorAll(".fsv2-scatter-point").forEach(point => point.addEventListener("mouseenter", () => { const value = points[Number(point.dataset.index)]; tooltip.innerHTML = `<b>${escapeHtml(value.period)}</b><br>X: ${value.x.toFixed(4)}<br>Y: ${value.y.toFixed(4)}`; tooltip.hidden = false; const pointBox = point.getBoundingClientRect(); const wrapBox = popover.querySelector(".fsv2-scatter-wrap").getBoundingClientRect(); tooltip.style.left = `${Math.max(4, pointBox.left - wrapBox.left + 8)}px`; tooltip.style.top = `${Math.max(4, pointBox.top - wrapBox.top - 8)}px`; }));
    popover.querySelectorAll(".fsv2-scatter-point").forEach(point => point.addEventListener("mouseleave", () => { tooltip.hidden = true; }));
    const close = () => { popover.remove(); backdrop.remove(); document.removeEventListener("keydown", onKeyDown); };
    const onKeyDown = event => { if (event.key === "Escape") close(); };
    popover.querySelector("button").addEventListener("click", close); backdrop.addEventListener("click", close); document.addEventListener("keydown", onKeyDown); document.body.append(backdrop, popover);
}

function showCorrelationInfo(event) {
    event.stopPropagation();
    window.fsV2CloseCorrelationInfo?.();
    const popover = document.createElement("div"); popover.className = "fsv2-correlation-popover fsv2-temporal-popover fsv2-correlation-info-popover";
    popover.innerHTML = `<div class="fsv2-correlation-popover-head"><strong>How to read this chart</strong><button type="button" aria-label="Close">×</button></div><div class="fsv2-correlation-info-body fsv2-correlation-guide"><section class="fsv2-correlation-guide-section"><h3><i class="ti ti-database" aria-hidden="true"></i> Choose the corpus</h3><div class="fsv2-correlation-scope-card"><strong>Human Mobility Indicators and Domains</strong><p>Only Human Mobility messages or stories. It compares Human Mobility indicators—such as Migration or Forced displacement—with analytical domains found in those same records.</p></div><div class="fsv2-correlation-scope-card"><strong>Domains <span>Full corpus</span></strong><p>Every monitored message or story, including records outside Human Mobility. It compares analytical domains across the broader conversation.</p></div></section><section class="fsv2-correlation-guide-section"><h3><i class="ti ti-calendar-stats" aria-hidden="true"></i> Calculate prevalence</h3><p>Data can be aggregated by <b>day</b>, <b>week</b>, or <b>month</b>. <b>Auto</b> selects the most appropriate interval for the chosen time range; you can also select any interval manually.</p><ol class="fsv2-correlation-steps"><li>For each period, examine every message or story once.</li><li>A record counts when it contains at least one topic belonging to an indicator or domain. Several matching topics still count as one record.</li><li>Divide matching records by all records in that corpus and period.</li></ol><div class="fsv2-correlation-formula"><span>Prevalence</span><b>=</b><span>matching records</span><b>/</b><span>all records in the period</span></div><p class="fsv2-correlation-note"><i class="ti ti-info-circle" aria-hidden="true"></i> One record may count for more than one item, so item prevalences do not add up to 100%.</p></section><section class="fsv2-correlation-guide-section"><h3><i class="ti ti-chart-dots-3" aria-hidden="true"></i> Read a correlation cell</h3><p>For each indicator/domain or domain/domain pair, the chart calculates Pearson's coefficient, <span class="fsv2-math">r</span>, from their prevalence values across the selected periods.</p><div class="fsv2-correlation-key"><span><b>+1</b> perfect positive</span><span><b>0</b> no linear pattern</span><span><b>−1</b> perfect negative</span></div><p>Pearson correlation measures how closely the prevalences of two items vary together across the selected periods. A positive value means that their prevalences tend to rise and fall together. A negative value means that higher prevalence of one item tends to coincide with lower prevalence of the other. Correlation describes linear association, not causality.</p><p class="fsv2-correlation-note"><i class="ti ti-info-circle" aria-hidden="true"></i> <b>N/A</b> means a coefficient cannot be calculated, usually because one item has no variation across the selected periods or there are too few periods to compare.</p></section></div>`;
    const anchorButton = event.currentTarget;
    const host = anchorButton.closest(".fsv2-card");
    const hostRect = host.getBoundingClientRect();
    const popoverWidth = Math.min(380, window.innerWidth - 32);
    popover.style.setProperty("width", `${popoverWidth}px`, "important");
    popover.style.setProperty("position", "absolute", "important");
    popover.style.setProperty("transform", "none", "important");
    const updatePosition = () => {
        const anchor = anchorButton.getBoundingClientRect();
        popover.style.setProperty("top", `${anchor.bottom - hostRect.top + 10}px`, "important");
        popover.style.setProperty("left", `${Math.max(16, anchor.right - hostRect.left - popoverWidth)}px`, "important");
    };
    const close = () => { popover.remove(); document.removeEventListener("keydown", onKeyDown); document.removeEventListener("click", onOutsideClick); if (window.fsV2CloseCorrelationInfo === close) window.fsV2CloseCorrelationInfo = null; };
    window.fsV2CloseCorrelationInfo = close;
    const onKeyDown = keyEvent => { if (keyEvent.key === "Escape") close(); };
    const onOutsideClick = clickEvent => { if (!popover.contains(clickEvent.target) && clickEvent.target !== anchorButton) close(); };
    popover.querySelector("button").addEventListener("click", close);
    host.style.position = "relative";
    host.append(popover);
    updatePosition();
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onOutsideClick);
}

function formatCorrelationPeriod(period) {
    if (typeof period !== "number") return String(period || "");
    const date = new Date(Date.UTC(1, 0, 1)); date.setUTCDate(period - 1); return date.toISOString().slice(0, 10);
}

function renderRawDomainCorrelation(containerId, payload) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!payload || payload.days < 30) { container.innerHTML = `<strong>Full-corpus domain correlation unavailable</strong><br>Requires at least 30 days.`; return; }
    container.innerHTML = `<div class="fsv2-temporal-head"><strong>Domain attention correlation</strong><span>Raw daily prevalence · ${payload.days} days</span></div><div class="fsv2-temporal-grid"></div>`;
    renderTemporalHeatmap(container.querySelector(".fsv2-temporal-grid"), payload, "levels");
}

function renderUnifiedCorrelation(containerId, mixedPayload, domainPayload, initialAggregation = "daily") {
    const container = document.getElementById(containerId);
    if (!container) return;
    let mode = "mixed_levels";
    let aggregation = initialAggregation;
    const draw = () => {
        const isDomain = mode.startsWith("domain");
        const payload = isDomain ? domainPayload : mixedPayload;
        const matrixMode = isDomain ? "levels" : "raw_levels";
        container.innerHTML = `<div class="fsv2-unified-controls"><button data-mode="mixed_levels" class="fsv2-unified-view-button ${mode === "mixed_levels" ? "is-active" : ""}">Human Mobility Indicators and Domains</button><button data-mode="domain_levels" class="fsv2-unified-view-button ${mode === "domain_levels" ? "is-active" : ""}">Domains <span>(full corpus)</span></button><span class="fsv2-unified-period"><i class="ti ti-calendar-event" aria-hidden="true"></i>${aggregation}</span></div><div class="fsv2-temporal-grid"></div>`;
        renderTemporalHeatmap(container.querySelector(".fsv2-temporal-grid"), payload, matrixMode);
        container.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => { mode = button.dataset.mode; draw(); }));
    };
    draw();
    const info = container.closest(".fsv2-card")?.querySelector(".fsv2-correlation-info");
    if (info) info.onclick = showCorrelationInfo;
}

async function refreshUnifiedCorrelation(stream, containerId) {
    const { country, overallRange, interval, conditions } = window.fsV2State;
    const aggregation = correlationAggregation(interval);
    const conditionPayload = JSON.stringify(conditions || []);
    const [mixedPayload, domainPayload] = await Promise.all([
        fetchJson(`/${country}/domain_temporal_correlation_matrix`, { start_date: overallRange.start, end_date: overallRange.end, stream, conditions: conditionPayload, limit: 50, aggregation }),
        fetchJson(`/${country}/domain_attention_correlation_matrix`, { start_date: overallRange.start, end_date: overallRange.end, stream, limit: 50, aggregation }),
    ]);
    renderUnifiedCorrelation(containerId, mixedPayload, domainPayload, aggregation);
}

function correlationAggregation(interval) {
    const range = window.fsV2State?.overallRange;
    const resolved = range
        ? resolveIntervalForRange(range.start, range.end, interval)
        : interval;
    return { day: "daily", week: "weekly", month: "monthly" }[String(resolved || "day").toLowerCase()] || "daily";
}

function renderTfidfPills(containerId, rows) {
    let container = document.getElementById(containerId);
    if (!container) return;
    if (!Array.isArray(rows) || rows.length === 0) {
        container.innerHTML = `
            <div class="fsv2-trend-empty">
                <strong>No data available</strong>
                <span>No significant Telegram human mobility terms were available in the selected period.</span>
            </div>
        `;
        return;
    }
    let maxValue = Math.max(...rows.map((row) => Number(row.mean_value || 0)), 0);
    container.innerHTML = rows.map((row, index) => {
        let ratio = maxValue > 0 ? Number(row.mean_value || 0) / maxValue : 0;
        let score = Math.round(ratio * 100);
        return `
            <div class="fsv2-term-rank-row" title="${escapeHtml(`${row.lemma}: relative prominence across the selected period. Exact TF-IDF: ${Number(row.mean_value || 0).toFixed(2)}. Rank #${index + 1}.`)}">
                <span class="fsv2-term-rank">${index + 1}</span>
                <span class="fsv2-term-rank-label">${escapeHtml(row.lemma)}</span>
                <span class="fsv2-term-rank-track" aria-hidden="true">
                    <span class="fsv2-term-rank-fill" style="width:${score}%"></span>
                </span>
                <span class="fsv2-term-rank-score">${score}</span>
            </div>
        `;
    }).join("");
}

function renderTfidfNote() {
    let note = document.getElementById("fsv2-social-tfidf-note");
    if (!note) return;
    if (window.fsV2State.tfidfMetric === "daily_peak") {
        note.innerHTML = `
            <span><span class="fsv2-dot fsv2-dot-tg"></span>Each point marks one of the top 50 daily TF-IDF peaks in the selected human mobility period.</span>
            <span><span class="fsv2-tfidf-swatch fsv2-tfidf-swatch-strong"></span>Higher peaks indicate stronger day-level distinctiveness.</span>
        `;
        return;
    }
    note.innerHTML = `
        <span><span class="fsv2-dot fsv2-dot-tg"></span>Higher scores mean the term is more distinctive in the selected human mobility messages.</span>
    `;
}

function tfidfDateToUtc(dateInt) {
    if (!dateInt) return null;
    return dtFromDateInt(Number(dateInt)).getTime();
}

function tfidfBucketDateId(dateInt, interval) {
    if (!dateInt) return null;
    if (interval === "day") return Number(dateInt);
    let date = dtFromDateInt(Number(dateInt));
    let bucketDate = interval === "month" ? startOfMonthUTC(date) : startOfWeekUTC(date);
    return Number(
        `${bucketDate.getUTCFullYear()}${String(bucketDate.getUTCMonth() + 1).padStart(2, "0")}${String(bucketDate.getUTCDate()).padStart(2, "0")}`
    );
}

function truncatePeakTermLabel(term, maxLength = 16) {
    let raw = String(term || "").trim();
    if (raw.length <= maxLength) return raw;
    return `${raw.slice(0, Math.max(0, maxLength - 1))}\u2026`;
}

function ensureTfidfPeakLabelState(chart, series, interval) {
    if (!chart || !series) return new Set();
    let axis = chart.xAxis?.[0];
    if (!axis) return new Set();
    let min = axis.min ?? axis.dataMin ?? null;
    let max = axis.max ?? axis.dataMax ?? null;
    let cacheKey = [
        Math.round(min ?? 0),
        Math.round(max ?? 0),
        chart.plotWidth,
        interval,
        series.points.length,
    ].join(":");
    if (chart._tfidfPeakLabelCacheKey === cacheKey && chart._tfidfPeakLabelKeys instanceof Set) {
        return chart._tfidfPeakLabelKeys;
    }
    let visiblePoints = (series.points || []).filter((point) => {
        if (point.y == null || !point.label_key) return false;
        if (min != null && point.x < min) return false;
        if (max != null && point.x > max) return false;
        return true;
    });
    let maxLabels = Math.max(4, Math.min(12, Math.floor(chart.plotWidth / 110)));
    let minGap = interval === "month" ? 110 : interval === "week" ? 92 : 80;
    let chosen = [];
    let keys = new Set();
    visiblePoints
        .sort((a, b) => (Number(b.y || 0) - Number(a.y || 0)) || (a.x - b.x))
        .forEach((point) => {
            if (keys.size >= maxLabels) return;
            let pixelX = axis.toPixels(point.x, true);
            let tooClose = chosen.some((other) => Math.abs(other.pixelX - pixelX) < minGap);
            if (tooClose) return;
            chosen.push({ pixelX, key: point.label_key });
            keys.add(point.label_key);
        });
    chart._tfidfPeakLabelCacheKey = cacheKey;
    chart._tfidfPeakLabelKeys = keys;
    return keys;
}

function renderTfidfDailyPeakChart(containerId, rows) {
    let container = document.getElementById(containerId);
    if (!container) return;
    if (!Array.isArray(rows) || rows.length === 0) {
        container.innerHTML = `
            <div class="fsv2-trend-empty">
                <strong>No data available</strong>
                <span>No significant Telegram human mobility terms were available in the selected period.</span>
            </div>
        `;
        return;
    }
    let colors = chartColors();
    let chartInterval = "day";
    let displayRows = Array.isArray(rows) ? rows.map((row, index) => ({
        ...row,
        bucket_date_id: tfidfBucketDateId(row.date_id, chartInterval),
        bucket_rank: null,
        overall_rank: row.overall_rank || index + 1,
    })) : [];
    let base = baseChartOptions(null);
    let maxValue = 0;
    for (let row of displayRows) {
        let value = Number(row.mean_value || 0);
        if (!Number.isNaN(value) && value > maxValue) {
            maxValue = value;
        }
    }
    let groupedCounts = new Map();
    let rawSeriesData = displayRows
        .map((row, index) => {
            let x = tfidfDateToUtc(row.date_id);
            let y = Number(row.mean_value || 0);
            if (!x || Number.isNaN(y)) return null;
            let ratio = maxValue > 0 ? y / maxValue : 0;
            let color = ratio >= 0.66
                ? colors.tg
                : ratio >= 0.33
                    ? "rgba(29, 158, 117, 0.68)"
                    : "rgba(29, 158, 117, 0.38)";
            return {
                x,
                y,
                color,
                term: row.lemma,
                rank: row.overall_rank || index + 1,
                date_id: row.date_id,
                bucket_date_id: row.bucket_date_id,
                bucket_rank: null,
                overall_rank: row.overall_rank || null,
                bucket_count: 1,
                _rawX: x,
                _anchorX: x,
                label_key: `${row.lemma || ""}:${row.date_id || row.bucket_date_id || x}:${index}`,
            };
        })
        .filter(Boolean);
    let positionedSeriesData = rawSeriesData;
    positionedSeriesData.forEach((row) => {
        let key = row._anchorX ?? row.x;
        groupedCounts.set(key, (groupedCounts.get(key) || 0) + 1);
    });
    let seriesData = positionedSeriesData
        .map((row) => ({
            ...row,
            bucket_count: row.cluster_count || row.bucket_count || groupedCounts.get(row._anchorX ?? row.x) || 1,
        }))
        .sort((a, b) => a.x - b.x || b.y - a.y);
    let stemMap = new Map();
    seriesData.forEach((point) => {
        let key = point._anchorX ?? point.x;
        let current = stemMap.get(key);
        if (!current || point.y > current.y) {
            stemMap.set(key, { x: key, y: point.y });
        }
    });
    let stemData = Array.from(stemMap.values()).sort((a, b) => a.x - b.x);
    Highcharts.chart(containerId, {
        ...base,
        chart: {
            ...base.chart,
            className: "fsv2-tfidf-peak-chart",
            type: "scatter",
            height: null,
            zoomType: "x",
            panning: { enabled: false },
            spacingTop: 8,
            spacingRight: 8,
            spacingBottom: 8,
            spacingLeft: 8,
            marginLeft: 54,
            marginRight: 16,
            marginTop: 12,
            marginBottom: 38,
            backgroundColor: "transparent",
            plotBackgroundColor: "transparent",
        },
        lang: {
            resetZoom: "Reset zoom",
        },
        xAxis: {
            ...base.xAxis,
            tickLength: 0,
            gridLineWidth: 1,
            tickPixelInterval: chartInterval === "month" ? 72 : 96,
            lineColor: colors.grid,
            labels: {
                style: { color: colors.text, fontSize: "10px" },
                formatter: function () {
                    if (chartInterval === "month") return Highcharts.dateFormat("%b '%y", this.value);
                    if (chartInterval === "week") return Highcharts.dateFormat("%e %b", this.value);
                    return Highcharts.dateFormat("%e %b", this.value);
                },
            },
        },
        yAxis: {
            ...base.yAxis,
            min: 0,
            title: {
                text: "TF-IDF",
                reserveSpace: true,
                margin: 12,
                style: { color: colors.text, fontSize: "10px" },
            },
            tickLength: 0,
            maxPadding: 0.12,
            endOnTick: true,
            gridLineWidth: 1,
            lineWidth: 0,
            labels: {
                style: { color: colors.text, fontSize: "10px" },
                formatter: function () {
                    return Number(this.value).toFixed(1);
                },
            },
        },
        tooltip: {
            ...base.tooltip,
            shared: false,
            formatter: function () {
                let bucketLabel = formatDateLabel(this.point.date_id);
                let rankLabel = `Rank: <strong>#${this.point.rank}</strong>`;
                return `
                    <strong>${escapeHtml(this.point.term || "")}</strong><br/>
                    ${bucketLabel}<br/>
                    TF-IDF: <strong>${Number(this.y || 0).toFixed(2)}</strong><br/>
                    ${rankLabel}
                `;
            },
        },
        legend: { enabled: false },
        resetZoomButton: {
            position: {
                align: "right",
                verticalAlign: "top",
                x: -6,
                y: 8,
            },
            theme: {
                fill: "#fbfaf6",
                stroke: colors.grid,
                "stroke-width": 1,
                r: 999,
                style: {
                    color: colors.dark,
                    fontSize: "11px",
                    fontWeight: "600",
                },
                states: {
                    hover: {
                        fill: "#ffffff",
                        style: {
                            color: colors.dark,
                        },
                    },
                },
            },
        },
        plotOptions: {
            series: {
                animation: false,
                states: { hover: { enabled: true } },
            },
            column: {
                turboThreshold: 0,
                borderWidth: 0,
                pointWidth: chartInterval === "month" ? 8 : 6,
                groupPadding: 0,
                pointPadding: 0,
                color: "rgba(29, 158, 117, 0.14)",
                enableMouseTracking: false,
            },
            scatter: {
                turboThreshold: 0,
                lineWidth: 0,
                marker: {
                    enabled: true,
                    radius: 4.5,
                    symbol: "circle",
                    lineWidth: 1.5,
                    lineColor: "#fbfaf6",
                },
                dataLabels: {
                    enabled: true,
                    allowOverlap: false,
                    crop: false,
                    overflow: "allow",
                    padding: 4,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "rgba(224, 221, 213, 0.92)",
                    backgroundColor: "rgba(251, 250, 246, 0.96)",
                    y: -10,
                    formatter: function () {
                        let labelKeys = ensureTfidfPeakLabelState(this.series.chart, this.series, chartInterval);
                        if (!labelKeys.has(this.point.label_key)) return null;
                        return truncatePeakTermLabel(this.point.term, chartInterval === "day" ? 16 : 14);
                    },
                    style: {
                        color: colors.dark,
                        fontSize: "10px",
                        fontWeight: "600",
                        textOutline: "none",
                    },
                },
            },
        },
        series: [{
            type: "column",
            name: "Peak stems",
            data: stemData,
            color: "rgba(29, 158, 117, 0.14)",
            borderRadius: 3,
        }, {
            type: "scatter",
            name: "Daily peaks",
            data: seriesData,
        }],
    });
}

function renderSocialMessages(containerId, rows, append = false) {
    let container = document.getElementById(containerId);
    if (!container) return;
    if (!append) {
        if (!Array.isArray(rows) || rows.length === 0) {
            container.innerHTML = `
                <div class="fsv2-trend-empty">
                    <strong>No data available</strong>
                    <span>No Telegram human mobility messages matched the selected filters.</span>
                </div>
            `;
            return;
        }
        container.innerHTML = "";
    }
    let formatter = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
    let html = rows.map((row) => {
        let when = row.timestamp ? formatter.format(new Date(row.timestamp)) : "Unknown time";
        let channelUsername = normalizeTelegramUsername(row.channel_username || row.username);
        let channel = row.channel_title || channelUsername || row.author_username || "Telegram source";
        let channelHandle = channelUsername ? `@${channelUsername}` : "";
        let permalink = channelUsername && row.message_id ? `https://t.me/${channelUsername}/${row.message_id}` : null;
        let components = Array.isArray(row.detected_components) ? row.detected_components : [];
        let translationPayload = escapeHtml(JSON.stringify({
            title: `Translated message from ${channel}`,
            subtitle: [when, channelHandle].filter(Boolean).join(" · "),
            body: row.body || "",
        }));
        let topicsPayload = escapeHtml(JSON.stringify(components));
        return `
            <article class="fsv2-message-item">
                <div class="fsv2-message-corner-actions">
                    ${permalink ? `
                        <a
                            class="fsv2-message-corner-action"
                            href="${escapeHtml(permalink)}"
                            target="_blank"
                            rel="noreferrer"
                            title="Open original message"
                            aria-label="Open original message"
                        ><i class="ti ti-external-link" aria-hidden="true"></i></a>
                    ` : ""}
                    <button
                        type="button"
                        class="fsv2-message-expand fsv2-message-corner-action"
                        data-message-dialog="${translationPayload}"
                        title="View full translation"
                        aria-label="View full translation"
                    ><i class="ti ti-language" aria-hidden="true"></i></button>
                </div>
                <div class="fsv2-message-title">
                    <span class="fsv2-dot fsv2-dot-tg"></span>
                    <strong>${escapeHtml(channel)}</strong>
                </div>
                <div class="fsv2-message-meta">
                    <span>${escapeHtml(when)}</span>
                    ${channelHandle ? `<span>${escapeHtml(channelHandle)}</span>` : ""}
                </div>
                <div class="fsv2-message-body">${escapeHtml(row.body || "")}</div>
                ${components.length ? `
                    <div class="fsv2-message-topics-compact">
                        <span class="fsv2-message-topics-label">Topics (${components.length}):</span>
                        <span class="fsv2-message-topics-text">${componentTextListHtml(components)}</span>
                        ${components.length > 4 ? `
                            <button
                                type="button"
                                class="fsv2-message-topics-toggle"
                                data-topics-popover="${topicsPayload}"
                            >View all ${components.length}</button>
                        ` : ""}
                    </div>
                ` : ""}
            </article>
        `;
    }).join("");
    container.insertAdjacentHTML("beforeend", html);
}

function storySourceLabel(row) {
    let username = String(row.username || "").trim();
    if (username) return username;
    try {
        return new URL(row.url).hostname.replace(/^www\./i, "");
    } catch (_) {
        return "Media source";
    }
}

function renderMediaStories(containerId, rows, append = false) {
    let container = document.getElementById(containerId);
    if (!container) return;
    if (!append) {
        if (!Array.isArray(rows) || rows.length === 0) {
            container.innerHTML = `
                <div class="fsv2-trend-empty">
                    <strong>No data available</strong>
                    <span>No MediaCloud human mobility stories matched the selected filters.</span>
                </div>
            `;
            return;
        }
        container.innerHTML = "";
    }
    let formatter = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
    let html = rows.map((row) => {
        let when = row.timestamp ? formatter.format(new Date(row.timestamp)) : "Unknown time";
        let source = storySourceLabel(row);
        let detectedComponents = Array.isArray(row.detected_components) ? row.detected_components : [];
        let detectedTopics = Array.isArray(row.detected_topics) ? row.detected_topics : [];
        let components = detectedComponents.length
            ? detectedComponents
            : detectedTopics.map((topic) => ({
                component_name: topic,
                indicator_name: "",
                domain_name: "",
                matched_terms: [],
            }));
        let translationPayload = escapeHtml(JSON.stringify({
            title: `Translated story from ${source}`,
            subtitle: when,
            body: row.body || "",
        }));
        let topicsPayload = escapeHtml(JSON.stringify(components));
        return `
            <article class="fsv2-message-item">
                <div class="fsv2-message-corner-actions">
                    ${row.url ? `
                        <a
                            class="fsv2-message-corner-action"
                            href="${escapeHtml(row.url)}"
                            target="_blank"
                            rel="noreferrer"
                            title="Open original story"
                            aria-label="Open original story"
                        ><i class="ti ti-external-link" aria-hidden="true"></i></a>
                    ` : ""}
                    <button
                        type="button"
                        class="fsv2-message-expand fsv2-message-corner-action"
                        data-message-dialog="${translationPayload}"
                        title="View full translation"
                        aria-label="View full translation"
                    ><i class="ti ti-language" aria-hidden="true"></i></button>
                </div>
                <div class="fsv2-message-title">
                    <span class="fsv2-dot fsv2-dot-mc"></span>
                    <strong>${escapeHtml(source)}</strong>
                </div>
                <div class="fsv2-message-meta">
                    <span>${escapeHtml(when)}</span>
                </div>
                <div class="fsv2-message-body">${escapeHtml(row.body || "")}</div>
                ${components.length ? `
                    <div class="fsv2-message-topics-compact">
                        <span class="fsv2-message-topics-label">Topics (${components.length}):</span>
                        <span class="fsv2-message-topics-text">${componentTextListHtml(components)}</span>
                        ${components.length > 4 ? `
                            <button
                                type="button"
                                class="fsv2-message-topics-toggle"
                                data-topics-popover="${topicsPayload}"
                            >View all ${components.length}</button>
                        ` : ""}
                    </div>
                ` : ""}
            </article>
        `;
    }).join("");
    container.insertAdjacentHTML("beforeend", html);
}

function updateSocialLoadMoreButton() {
    let button = document.getElementById("fsv2-social-load-more");
    if (!button) return;
    button.hidden = !window.fsV2State.socialMessagesHasMore;
    button.disabled = false;
    button.textContent = "Load more messages";
}

async function loadMoreSocialMessages() {
    let button = document.getElementById("fsv2-social-load-more");
    if (button) {
        button.disabled = true;
        button.textContent = "Loading...";
    }
    let { country, overallRange, conditions, socialMessagesLimit, socialMessagesOffset } = window.fsV2State;
    let rows = await fetchJson(`/${country}/tg_messages`, {
        start_date: overallRange.start,
        end_date: overallRange.end,
        conditions: JSON.stringify(conditions || []),
        sorted_by: "date",
        limit: socialMessagesLimit,
        offset: socialMessagesOffset,
        scope: "hm",
    });
    renderSocialMessages("fsv2-social-messages", rows, socialMessagesOffset > 0);
    window.fsV2State.socialMessagesOffset += rows.length;
    window.fsV2State.socialMessagesHasMore = rows.length === socialMessagesLimit;
    updateSocialLoadMoreButton();
}

function updateMediaLoadMoreButton() {
    let button = document.getElementById("fsv2-media-load-more");
    if (!button) return;
    button.hidden = !window.fsV2State.mediaStoriesHasMore;
    button.disabled = false;
    button.textContent = "Load more stories";
}

async function loadMoreMediaStories() {
    let button = document.getElementById("fsv2-media-load-more");
    if (button) {
        button.disabled = true;
        button.textContent = "Loading...";
    }
    let { country, overallRange, conditions, mediaStoriesLimit, mediaStoriesOffset } = window.fsV2State;
    let rows = await fetchJson(`/${country}/mc_stories`, {
        start_date: overallRange.start,
        end_date: overallRange.end,
        conditions: JSON.stringify(conditions || []),
        sorted_by: "date",
        limit: mediaStoriesLimit,
        offset: mediaStoriesOffset,
        scope: "hm",
    });
    renderMediaStories("fsv2-media-stories", rows, mediaStoriesOffset > 0);
    window.fsV2State.mediaStoriesOffset += rows.length;
    window.fsV2State.mediaStoriesHasMore = rows.length === mediaStoriesLimit;
    updateMediaLoadMoreButton();
}

async function loadSummary(intervalOnly = false) {
    let { country, overallRange, searchRange, interval, conditions } = window.fsV2State;
    let hasTopicFilter = (window.fsV2State.selectedTopicIds || []).length > 0;
    let conditionPayload = JSON.stringify(conditions || []);
    let attentionEndpoint = hasTopicFilter
        ? `/${country}/hm_topic_attention_trends`
        : `/${country}/hm_indicator_attention_trends`;
    let loadingTargets = [
        "fsv2-tg-kpi-chart",
        "fsv2-mc-kpi-chart",
        "fsv2-attention-tg-chart",
        "fsv2-attention-mc-chart",
        "fsv2-sentiment-tg-chart",
        "fsv2-sentiment-mc-chart",
        "fsv2-anomaly-tg-chart",
        "fsv2-anomaly-mc-chart",
    ];
    if (!intervalOnly || !window.fsV2State.searchInterestSeries) {
        loadingTargets.push("fsv2-ssi-chart");
    }
    loadingTargets.forEach(setLoading);
    let requests = [
        fetchJson(`/${country}/corpus_coverage_series`, {
            start_date: overallRange.start,
            end_date: overallRange.end,
            stream: "tg",
            interval,
            conditions: conditionPayload,
        }),
        fetchJson(`/${country}/corpus_coverage_series`, {
            start_date: overallRange.start,
            end_date: overallRange.end,
            stream: "mc",
            interval,
            conditions: conditionPayload,
        }),
        fetchJson(attentionEndpoint, {
            start_date: overallRange.start,
            end_date: overallRange.end,
            stream: "tg",
            interval,
            conditions: conditionPayload,
        }),
        fetchJson(attentionEndpoint, {
            start_date: overallRange.start,
            end_date: overallRange.end,
            stream: "mc",
            interval,
            conditions: conditionPayload,
        }),
        fetchJson(`/${country}/overall_trend_hc`, {
            start_date: overallRange.start,
            end_date: overallRange.end,
            trend_type: "sentiment",
            conditions: conditionPayload,
            scope: "hm",
            interval,
        }),
        fetchJson(`/${country}/hm_indicator_anomaly_trends`, {
            start_date: overallRange.start,
            end_date: overallRange.end,
            stream: "tg",
            conditions: conditionPayload,
            interval,
        }),
        fetchJson(`/${country}/hm_indicator_anomaly_trends`, {
            start_date: overallRange.start,
            end_date: overallRange.end,
            stream: "mc",
            conditions: conditionPayload,
            interval,
        }),
    ];
    if (!intervalOnly || !window.fsV2State.searchInterestSeries) {
        requests.push(fetchJson(`/${country}/ssi_fields_series`, {
            start_date: searchRange.start,
            end_date: searchRange.end,
            domain_id: 5,
            field_ids: JSON.stringify([15, 16, 18]),
        }));
    }
    let results = await Promise.all(requests);
    let [
        tgCoverage,
        mcCoverage,
        tgAttentionSeries,
        mcAttentionSeries,
        sentimentSeries,
        tgAnomalySeries,
        mcAnomalySeries,
    ] = results;
    let ssiSeries = results[7] || window.fsV2State.searchInterestSeries;
    if (results[7]) {
        window.fsV2State.searchInterestSeries = results[7];
    }

    let colors = chartColors();
    renderCoverageKpi(
        "fsv2-tg",
        tgCoverage,
        hasTopicFilter ? "Filtered human mobility messages" : "Human mobility messages",
        "tg"
    );
    renderCoverageKpi(
        "fsv2-mc",
        mcCoverage,
        hasTopicFilter ? "Filtered human mobility news stories" : "Human mobility news stories",
        "mc"
    );

    renderIndicatorAttentionChart("fsv2-attention-tg-chart", tgAttentionSeries);
    renderIndicatorAttentionChart("fsv2-attention-mc-chart", mcAttentionSeries);
    renderSentimentTrendChart("fsv2-sentiment-tg-chart", filterSeriesByName(sentimentSeries, "Social"));
    renderSentimentTrendChart("fsv2-sentiment-mc-chart", filterSeriesByName(sentimentSeries, "Media"));
    renderAnomalyTrendChart("fsv2-anomaly-tg-chart", tgAnomalySeries);
    renderAnomalyTrendChart("fsv2-anomaly-mc-chart", mcAnomalySeries);
    if (ssiSeries) {
        renderSearchInterestChart("fsv2-ssi-chart", extractSeriesMap(ssiSeries));
    }
    window.fsV2State.loadedTabs.summary = true;
}

async function loadSocialListening(intervalOnly = false) {
    let { country, overallRange, interval, conditions } = window.fsV2State;
    let hasTopicFilter = (window.fsV2State.selectedTopicIds || []).length > 0;
    let conditionPayload = JSON.stringify(conditions || []);
    let attentionEndpoint = hasTopicFilter
        ? `/${country}/hm_topic_attention_trends`
        : `/${country}/hm_indicator_attention_trends`;

    let needStatic = !intervalOnly || !window.fsV2State.socialStaticData;
    let loadingTargets = needStatic
        ? [
            "fsv2-social-domain-chart",
            "fsv2-social-talking-points",
            "fsv2-social-unified-correlation",
            "fsv2-social-attention-chart",
            "fsv2-social-sentiment-chart",
            "fsv2-social-messages",
        ]
        : [
            "fsv2-social-unified-correlation",
            "fsv2-social-attention-chart",
            "fsv2-social-sentiment-chart",
        ];
    let needTfidf = !window.fsV2State.socialTfidf?.period_average || !window.fsV2State.socialTfidf?.daily_peak;
    if (needTfidf) {
        loadingTargets.push("fsv2-social-tfidf-pills", "fsv2-social-tfidf-chart");
    }
    loadingTargets.forEach(setLoading);

    if (needStatic) {
        let [
            socialSummary,
            domainRanking,
            talkingPoints,
            temporalCorrelation,
            domainAttentionCorrelation,
        ] = await Promise.all([
            fetchJson(`/${country}/social_listening_summary`, {
                start_date: overallRange.start,
                end_date: overallRange.end,
                conditions: conditionPayload,
            }),
            fetchJson(`/${country}/domain_ranking`, {
                start_date: overallRange.start,
                end_date: overallRange.end,
                stream: "tg",
                conditions: conditionPayload,
                scope: "hm",
            }),
            fetchJson(`/${country}/hm_indicator_talking_points`, {
                start_date: overallRange.start,
                end_date: overallRange.end,
                stream: "tg",
                conditions: conditionPayload,
            }),
            fetchJson(`/${country}/domain_temporal_correlation_matrix`, { start_date: overallRange.start, end_date: overallRange.end, stream: "tg", conditions: conditionPayload, limit: 50, aggregation: correlationAggregation(interval) }),
            fetchJson(`/${country}/domain_attention_correlation_matrix`, { start_date: overallRange.start, end_date: overallRange.end, stream: "tg", limit: 50, aggregation: correlationAggregation(interval) }),
        ]);
        window.fsV2State.socialStaticData = { socialSummary, domainRanking, talkingPoints };
        renderSocialSummaryKpis(socialSummary);
        renderDomainComparisonChart("fsv2-social-domain-chart", domainRanking, "tg");
        renderTalkingPoints("fsv2-social-talking-points", talkingPoints, true);
        renderUnifiedCorrelation("fsv2-social-unified-correlation", temporalCorrelation, domainAttentionCorrelation, correlationAggregation(interval));
    }

    if (needTfidf) {
        let [tfidfAverage, tfidfDailyPeak] = await Promise.all([
            fetchJson(`/${country}/tfidf_top_terms`, {
                start_date: overallRange.start,
                end_date: overallRange.end,
                stream: "tg",
                scope: "hm",
                metric: "period_average",
                limit: 50,
                max_document_frequency: 0.8,
            }),
            fetchJson(`/${country}/tfidf_top_terms`, {
                start_date: overallRange.start,
                end_date: overallRange.end,
                stream: "tg",
                scope: "hm",
                metric: "daily_peak",
                interval,
                limit: 50,
                max_document_frequency: 0.8,
            }),
        ]);
        window.fsV2State.socialTfidf = {
            period_average: tfidfAverage,
            daily_peak: tfidfDailyPeak,
        };
    }
    if (needStatic || needTfidf) {
        renderCurrentTfidf();
        syncSocialTopRow();
    }

    let [attentionSeries, sentimentSeries] = await Promise.all([
        fetchJson(attentionEndpoint, {
            start_date: overallRange.start,
            end_date: overallRange.end,
            stream: "tg",
            interval,
            conditions: conditionPayload,
        }),
        fetchJson(`/${country}/overall_trend_hc`, {
            start_date: overallRange.start,
            end_date: overallRange.end,
            trend_type: "sentiment",
            conditions: conditionPayload,
            scope: "hm",
            interval,
        }),
    ]);
    renderIndicatorAttentionChart("fsv2-social-attention-chart", attentionSeries);
    renderSentimentTrendChart("fsv2-social-sentiment-chart", filterSeriesByName(sentimentSeries, "Social"));
    if (intervalOnly) await refreshUnifiedCorrelation("tg", "fsv2-social-unified-correlation");
    if (needStatic) {
        window.fsV2State.socialMessagesOffset = 0;
        await loadMoreSocialMessages();
    }
    syncWorkspaceRailHeights();
    window.fsV2State.loadedTabs.social = true;
}

async function loadMediaMonitoring(intervalOnly = false) {
    let { country, overallRange, interval, conditions } = window.fsV2State;
    let hasTopicFilter = (window.fsV2State.selectedTopicIds || []).length > 0;
    let conditionPayload = JSON.stringify(conditions || []);
    let attentionEndpoint = hasTopicFilter
        ? `/${country}/hm_topic_attention_trends`
        : `/${country}/hm_indicator_attention_trends`;

    let needStatic = !intervalOnly || !window.fsV2State.mediaStaticData;
    let loadingTargets = needStatic
        ? [
            "fsv2-media-domain-chart",
            "fsv2-media-talking-points",
            "fsv2-media-unified-correlation",
            "fsv2-media-attention-chart",
            "fsv2-media-sentiment-chart",
            "fsv2-media-stories",
        ]
        : [
            "fsv2-media-unified-correlation",
            "fsv2-media-attention-chart",
            "fsv2-media-sentiment-chart",
        ];
    loadingTargets.forEach(setLoading);

    if (needStatic) {
        let [
            mediaSummary,
            domainRanking,
            talkingPoints,
            temporalCorrelation,
            domainAttentionCorrelation,
        ] = await Promise.all([
            fetchJson(`/${country}/media_monitoring_summary`, {
                start_date: overallRange.start,
                end_date: overallRange.end,
                conditions: conditionPayload,
            }),
            fetchJson(`/${country}/domain_ranking`, {
                start_date: overallRange.start,
                end_date: overallRange.end,
                stream: "mc",
                conditions: conditionPayload,
                scope: "hm",
            }),
            fetchJson(`/${country}/hm_indicator_talking_points`, {
                start_date: overallRange.start,
                end_date: overallRange.end,
                stream: "mc",
                conditions: conditionPayload,
            }),
            fetchJson(`/${country}/domain_temporal_correlation_matrix`, { start_date: overallRange.start, end_date: overallRange.end, stream: "mc", conditions: conditionPayload, limit: 50, aggregation: correlationAggregation(interval) }),
            fetchJson(`/${country}/domain_attention_correlation_matrix`, { start_date: overallRange.start, end_date: overallRange.end, stream: "mc", limit: 50, aggregation: correlationAggregation(interval) }),
        ]);
        window.fsV2State.mediaStaticData = { mediaSummary, domainRanking, talkingPoints };
        renderMediaSummaryKpis(mediaSummary);
        renderDomainComparisonChart("fsv2-media-domain-chart", domainRanking, "mc");
        renderTalkingPoints("fsv2-media-talking-points", talkingPoints, true);
        renderUnifiedCorrelation("fsv2-media-unified-correlation", temporalCorrelation, domainAttentionCorrelation, correlationAggregation(interval));
        syncMediaTopRow();
    }

    let [attentionSeries, sentimentSeries] = await Promise.all([
        fetchJson(attentionEndpoint, {
            start_date: overallRange.start,
            end_date: overallRange.end,
            stream: "mc",
            interval,
            conditions: conditionPayload,
        }),
        fetchJson(`/${country}/overall_trend_hc`, {
            start_date: overallRange.start,
            end_date: overallRange.end,
            trend_type: "sentiment",
            conditions: conditionPayload,
            scope: "hm",
            interval,
        }),
    ]);
    renderIndicatorAttentionChart("fsv2-media-attention-chart", attentionSeries);
    renderSentimentTrendChart("fsv2-media-sentiment-chart", filterSeriesByName(sentimentSeries, "Media"));
    if (intervalOnly) await refreshUnifiedCorrelation("mc", "fsv2-media-unified-correlation");
    if (needStatic) {
        window.fsV2State.mediaStoriesOffset = 0;
        await loadMoreMediaStories();
    }
    syncWorkspaceRailHeights();
    window.fsV2State.loadedTabs.media = true;
}

async function loadSearchInterest(intervalOnly = false) {
    let { country, searchRange } = window.fsV2State;
    if (!intervalOnly || !window.fsV2State.searchInterestSeries) {
        setLoading("fsv2-search-ssi-chart");
        window.fsV2State.searchInterestSeries = await fetchJson(`/${country}/ssi_fields_series`, {
            start_date: searchRange.start,
            end_date: searchRange.end,
            domain_id: 5,
            field_ids: JSON.stringify([15, 16, 18]),
        });
    }
    renderSearchInterestChart("fsv2-search-ssi-chart", extractSeriesMap(window.fsV2State.searchInterestSeries));
    window.fsV2State.loadedTabs.search = true;
}

async function refreshActiveTab(options = {}) {
    let intervalOnly = !!options.intervalOnly;
    if (window.fsV2State.activeTab === "social") {
        await loadSocialListening(intervalOnly);
        return;
    }
    if (window.fsV2State.activeTab === "media") {
        await loadMediaMonitoring(intervalOnly);
        return;
    }
    if (window.fsV2State.activeTab === "search") {
        await loadSearchInterest(intervalOnly);
        return;
    }
    await loadSummary(intervalOnly);
}

async function initV2() {
    deriveV2State();
    setupFilterBar();
    setupTabs();
    setupTfidfToggle();
    switchTab(window.fsV2State.activeTab);
    document.addEventListener("fullscreenchange", () => {
        Object.keys(visualizationStore()).forEach(updateVisualizationButtons);
        let fullscreenElement = document.fullscreenElement;
        if (fullscreenElement instanceof Element) {
            scheduleChartResizePasses(fullscreenElement);
            return;
        }
        let snapshot = fullscreenChartSnapshot;
        fullscreenChartSnapshot = null;
        restoreFullscreenChartSnapshot(snapshot);
    });
    window.addEventListener("resize", () => {
        syncWorkspaceRailHeights();
        let popover = document.getElementById("fsv2-matched-terms-popover");
        if (popover && !popover.hidden) {
            let anchor = document.getElementById(popover.dataset.anchorId || "");
            if (anchor) positionMatchedTermsPopover(anchor, popover);
        }
        let topicsPopover = document.getElementById("fsv2-message-topics-popover");
        if (topicsPopover && !topicsPopover.hidden) {
            let anchor = document.getElementById(topicsPopover.dataset.anchorId || "");
            if (anchor) positionMatchedTermsPopover(anchor, topicsPopover);
        }
    });
    window.addEventListener("scroll", (event) => {
        let scrollTarget = event.target instanceof Element ? event.target : null;
        if (scrollTarget?.closest("#fsv2-matched-terms-popover, #fsv2-message-topics-popover")) {
            return;
        }
        closeMatchedTermsPopover();
        closeMessageTopicsPopover();
    }, true);
    document.getElementById("fsv2-social-load-more")?.addEventListener("click", () => {
        loadMoreSocialMessages().catch(console.error);
    });
    document.getElementById("fsv2-media-load-more")?.addEventListener("click", () => {
        loadMoreMediaStories().catch(console.error);
    });
    document.addEventListener("click", (event) => {
        let topicDetail = event.target.closest(".fsv2-message-topic-popover-item[data-topic-detail]");
        if (topicDetail) {
            let popover = topicDetail.closest("#fsv2-message-topics-popover");
            let detail = {};
            try {
                detail = JSON.parse(topicDetail.dataset.topicDetail || "{}");
            } catch (_) {
                detail = {};
            }
            let components = JSON.parse(popover?.dataset.components || "[]");
            renderMessageTopicsPopover(popover, components, detail);
            return;
        }
        let topicsBack = event.target.closest(".fsv2-message-topics-back");
        if (topicsBack) {
            let popover = topicsBack.closest("#fsv2-message-topics-popover");
            let components = JSON.parse(popover?.dataset.components || "[]");
            renderMessageTopicsPopover(popover, components);
            return;
        }
        let topicsButton = event.target.closest(".fsv2-message-topics-toggle[data-topics-popover]");
        if (topicsButton) {
            let components = [];
            try {
                components = JSON.parse(topicsButton.dataset.topicsPopover || "[]");
            } catch (_) {
                components = [];
            }
            openMessageTopicsPopover(topicsButton, components);
            return;
        }
        let pill = event.target.closest(".fsv2-topic-pill-button[data-message-dialog]");
        if (pill) {
            let payload = {};
            try {
                payload = JSON.parse(pill.dataset.messageDialog || "{}");
            } catch (_) {
                payload = {};
            }
            openMatchedTermsPopover(pill, payload);
            return;
        }
        if (!event.target.closest("#fsv2-matched-terms-popover")) {
            closeMatchedTermsPopover();
        }
        if (!event.target.closest("#fsv2-message-topics-popover")) {
            closeMessageTopicsPopover();
        }
        let button = event.target.closest(".fsv2-message-expand");
        if (!button) return;
        let payload = {};
        try {
            payload = JSON.parse(button.dataset.messageDialog || "{}");
        } catch (_) {
            payload = {};
        }
        openMessageDialog(payload);
    });
    try {
        await refreshActiveTab();
        scheduleChartResizePasses(document);
    } catch (error) {
        console.error(error);
        setUnavailable("fsv2-tg", "Human mobility messages");
        setUnavailable("fsv2-mc", "Human mobility news stories");
    }
}

initV2();
