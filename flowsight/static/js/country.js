import { renderBarChartFromUrl } from "bar-chart";
import { renderTimeSeriesFromUrl, renderTimeSeries, processChartData, processOverallChartData } from "line-chart";
import { renderHTMLTableFromUrl, renderHTMLTable } from "./charts/html-table.js";
import { filterStructure } from "menu";
import { renderWordCloud } from "wordcloud";
import { renderOverallTimeSeriesFromUrl } from "line-chart";
import { showInfoPopup, hideInfoPopup } from "utils";


Highcharts.AST.allowedAttributes.push('viewBox');  // https://www.highcharts.com/forum/viewtopic.php?t=50646

const defaultStartDateInt = 19700101;
const defaultEndDateInt = 19700101;

window.topicFilterModes = {
    tg: localStorage.getItem('flowsightTopicFilterMode:tg') || 'strict',
    mc: localStorage.getItem('flowsightTopicFilterMode:mc') || 'strict'
};
window.tfidfMetric = localStorage.getItem('flowsightTfidfMetric') || 'period_average';
window.corpusCoverageInterval = localStorage.getItem('flowsightCorpusCoverageInterval') || 'auto';
window.activeCountryStream = 'oa';

function contentScope(){
    return 'hm';
}

function scopedParams(params){
    return {...params, scope: contentScope()};
}

function topicFilterMode(stream){
    return window.topicFilterModes[stream] || 'strict';
}

function topicScopedParams(params, stream){
    return {...scopedParams(params), topic_filter_mode: topicFilterMode(stream)};
}

function hasTopicCondition(stream){
    return (window.countryConditions?.[stream] || []).some(condition => condition.field === 'Topic');
}

function updateTopicFilterModeControl(stream){
    let toggle = $(`.topic-filter-mode-toggle[data-stream="${stream}"]`);
    toggle.prop('hidden', window.activeCountryStream !== stream || !hasTopicCondition(stream));
    toggle.find('.topic-filter-option').removeClass('active').attr('aria-pressed', 'false');
    toggle.find(`.topic-filter-option[data-topic-filter-mode="${topicFilterMode(stream)}"]`)
        .addClass('active')
        .attr('aria-pressed', 'true');
}

function setTopicFilterMode(stream, mode){
    window.topicFilterModes[stream] = mode;
    localStorage.setItem(`flowsightTopicFilterMode:${stream}`, mode);
    updateTopicFilterModeControl(stream);
}

function updateTopicFilterModeControls(){
    ['tg', 'mc'].forEach(updateTopicFilterModeControl);
    $('.corpus-summary-strip').prop('hidden', true);
    if (['tg', 'mc'].includes(window.activeCountryStream)){
        $(`#${window.activeCountryStream}-corpus-summary`).prop('hidden', false);
    }
}

function updateTfidfMetricControl(){
    let allowedMetrics = ['period_average', 'daily_peak'];
    if (!allowedMetrics.includes(window.tfidfMetric)){
        window.tfidfMetric = 'period_average';
    }
    $('.tfidf-metric-option').removeClass('active').attr('aria-pressed', 'false');
    $(`.tfidf-metric-option[data-tfidf-metric="${window.tfidfMetric}"]`)
        .addClass('active')
        .attr('aria-pressed', 'true');
}

function setTfidfMetric(metric){
    window.tfidfMetric = metric;
    localStorage.setItem('flowsightTfidfMetric', metric);
    updateTfidfMetricControl();
}

function updateCorpusCoverageIntervalControl(){
    let allowedIntervals = ['auto', 'day', 'week', 'month'];
    if (!allowedIntervals.includes(window.corpusCoverageInterval)){
        window.corpusCoverageInterval = 'auto';
    }
    $('.coverage-interval-option').removeClass('active').attr('aria-pressed', 'false');
    $(`.coverage-interval-option[data-coverage-interval="${window.corpusCoverageInterval}"]`)
        .addClass('active')
        .attr('aria-pressed', 'true');
}

function setCorpusCoverageInterval(interval){
    window.corpusCoverageInterval = interval;
    localStorage.setItem('flowsightCorpusCoverageInterval', interval);
    updateCorpusCoverageIntervalControl();
}

function streamRecordLabel(stream){
    return stream === 'tg' ? 'messages' : 'stories';
}

function formatCorpusCount(value){
    return Number(value || 0).toLocaleString();
}

async function CorpusSummary(stream){
    let start_date = stream === 'mc' ? window.mcStartDate : window.tgStartDate;
    let end_date = stream === 'mc' ? window.mcEndDate : window.tgEndDate;
    let container = $(`#${stream}-corpus-summary`);
    let recordLabel = streamRecordLabel(stream);
    let queryParams = $.param(
        scopedParams({
            start_date: start_date,
            end_date: end_date,
            conditions: JSON.stringify(window.countryConditions[stream]),
            stream: stream
        }),
        true
    );
    container.html('<span class="corpus-summary-metric">Loading corpus summary...</span>');
    try {
        let response = await fetch(`/${window.country}/corpus_summary?${queryParams}`);
        if (!response.ok){
            throw new Error(`Corpus summary request failed with ${response.status}`);
        }
        let data = await response.json();
        let coverage = data.filtered_hm_coverage == null
            ? 'N/A'
            : `${(data.filtered_hm_coverage * 100).toFixed(1)}%`;
        let period = `${moment(start_date.toString()).format('DD MMM YYYY')} - ${moment(end_date.toString()).format('DD MMM YYYY')}`;
        container.html(`
            <span class="corpus-summary-metric">Period <strong>${period}</strong></span>
            <span class="corpus-summary-metric">Collected ${recordLabel} <strong>${formatCorpusCount(data.all_records_in_period)}</strong></span>
            <span class="corpus-summary-metric">HM ${recordLabel} <strong>${formatCorpusCount(data.hm_records_in_period)}</strong></span>
            <span class="corpus-summary-metric">Matching ${recordLabel} <strong>${formatCorpusCount(data.filtered_hm_records_in_period)}</strong></span>
            <span class="corpus-summary-metric">HM coverage <strong>${coverage}</strong></span>
            <details class="corpus-summary-details">
                <summary>Corpus details</summary>
                <div class="corpus-summary-details-content">
                    <span class="corpus-summary-metric">Collected ${recordLabel}, all dates <strong>${formatCorpusCount(data.all_records_total)}</strong></span>
                    <span class="corpus-summary-metric">HM ${recordLabel}, all dates <strong>${formatCorpusCount(data.hm_records_total)}</strong></span>
                </div>
            </details>
        `);
    } catch (error) {
        console.error(error);
        container.html('<span class="corpus-summary-metric">Corpus summary unavailable</span>');
    }
}

function formatCoveragePercent(value){
    return value == null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

function renderCorpusCoverageSummary(stream, data){
    let summary = data.summary;
    let recordLabel = streamRecordLabel(stream);
    let change = summary.hm_coverage_change_pp;
    let changeClass = change == null ? 'neutral' : change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
    let changeLabel = change == null ? 'N/A' : `${change > 0 ? '+' : ''}${change.toFixed(1)} pp`;
    $(`#${stream}-corpus-coverage-summary`).html(`
        <span class="coverage-summary-metric">Collected ${recordLabel} <strong>${formatCorpusCount(summary.all_records)}</strong></span>
        <span class="coverage-summary-metric">HM ${recordLabel} <strong>${formatCorpusCount(summary.hm_records)}</strong></span>
        <span class="coverage-summary-metric">HM coverage <strong>${formatCoveragePercent(summary.hm_coverage)}</strong></span>
        <span class="coverage-summary-metric">vs previous period <strong class="coverage-summary-change ${changeClass}">${changeLabel}</strong></span>
        <span class="coverage-summary-metric">Buckets <strong>${data.interval}</strong></span>
    `);
}

function renderCorpusCoverageChart(stream, data){
    let recordLabel = streamRecordLabel(stream);
    let chartData = data.data;
    renderCorpusCoverageSummary(stream, data);
    if (chartData.length === 0){
        $(`#${stream}-corpus-coverage-chart`).html(noDataHTML);
        return;
    }
    Highcharts.chart(`${stream}-corpus-coverage-chart`, {
        chart: {
            type: 'column',
            zoomType: 'x'
        },
        title: {
            text: ''
        },
        xAxis: {
            type: 'datetime'
        },
        yAxis: [{
            min: 0,
            title: {
                text: 'Records'
            }
        }, {
            min: 0,
            max: 100,
            opposite: true,
            title: {
                text: 'HM coverage'
            },
            labels: {
                format: '{value}%'
            }
        }],
        tooltip: {
            shared: true,
            xDateFormat: data.interval === 'month' ? '%b %Y' : '%e %b %Y'
        },
        plotOptions: {
            column: {
                grouping: false,
                borderWidth: 0,
                groupPadding: 0.08
            }
        },
        series: [{
            type: 'column',
            className: 'coverage-total-series',
            name: `Collected ${recordLabel}`,
            data: chartData.map(point => [point.date, point.all_records]),
            tooltip: {
                valueDecimals: 0
            }
        }, {
            type: 'column',
            className: 'coverage-hm-series',
            name: `HM ${recordLabel}`,
            data: chartData.map(point => [point.date, point.hm_records]),
            pointPadding: 0.2,
            tooltip: {
                valueDecimals: 0
            }
        }, {
            type: 'line',
            className: 'coverage-ratio-series',
            name: 'HM coverage',
            data: chartData.map(point => [point.date, point.hm_coverage == null ? null : point.hm_coverage * 100]),
            yAxis: 1,
            tooltip: {
                valueDecimals: 1,
                valueSuffix: '%'
            }
        }]
    });
}

async function CorpusCoverageSeries(stream){
    let container = $(`#${stream}-corpus-coverage-chart`);
    let summaryContainer = $(`#${stream}-corpus-coverage-summary`);
    let queryParams = $.param({
        start_date: window.oaStartDate,
        end_date: window.oaEndDate,
        stream: stream,
        interval: window.corpusCoverageInterval
    }, true);
    container.html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    summaryContainer.html('<span class="coverage-summary-metric">Loading corpus coverage...</span>');
    try {
        let response = await fetch(`/${window.country}/corpus_coverage_series?${queryParams}`);
        if (!response.ok){
            throw new Error(`Corpus coverage request failed with ${response.status}`);
        }
        renderCorpusCoverageChart(stream, await response.json());
    } catch (error) {
        console.error(error);
        container.html(noDataHTML);
        summaryContainer.html('<span class="coverage-summary-metric">Corpus coverage unavailable</span>');
    }
}

function CorpusCoverageCharts(){
    CorpusCoverageSeries('tg');
    CorpusCoverageSeries('mc');
}

function isHumanMobilityScope(){
    return true;
}


const htmlTitleInfo = function(title, iconId){
    return `
    <div style="display: flex; align-items: center">
        <span class="hc-title" style="margin-right: 8px">${title}</span>
        <svg id="${iconId}" class="info-icon" style="cursor: pointer;" fill="#fefefe" xmlns="http://www.w3.org/2000/svg"  viewBox="0 0 24 24" width="1rem" height="1rem">    <path d="M 12 2 C 6.4889971 2 2 6.4889971 2 12 C 2 17.511003 6.4889971 22 12 22 C 17.511003 22 22 17.511003 22 12 C 22 6.4889971 17.511003 2 12 2 z M 12 4 C 16.430123 4 20 7.5698774 20 12 C 20 16.430123 16.430123 20 12 20 C 7.5698774 20 4 16.430123 4 12 C 4 7.5698774 7.5698774 4 12 4 z M 11 7 L 11 9 L 13 9 L 13 7 L 11 7 z M 11 11 L 11 17 L 13 17 L 13 11 L 11 11 z"/></svg>
    </div>
`
}
const nonHCTitleInfo = function(title, tooltipText){ return `
    <div>
        <span >${title}</span>
        <span data-bs-toggle="tooltip" data-bs-html="true" title="${tooltipText}">
            <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.5 8a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-9.75 2.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-1V7H7a.75.75 0 0 0 0 1.5h.25v2h-1ZM8 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="#fefefe"/></svg>
        </span>
    </div>

    `
}

const nonHCTitleInfos = function(title, content){ return `
    <div>
        <span class="hc-title" style="margin-right: 8px">${title}</span>
        <div class="popover__wrapper">
            <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.5 8a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-9.75 2.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-1V7H7a.75.75 0 0 0 0 1.5h.25v2h-1ZM8 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="#fefefe"/></svg>
            <div class="popover__content">
                ${content}
            </div>
        </div>
    </div>

    `
}

async function loadFile(path){
    fetch(path)  // Specifica il percorso al tuo file JSON
    .then(response => {
        if (!response.ok) {
            throw new Error('Errore nel caricamento del file JSON');
        }
        console.log(response)
        return response.json();  // Converte la risposta in formato JSON
    })
    .catch(error => {
        console.error('Errore:', error);
    });
}

const TgTalkingPointsTitle = nonHCTitleInfo(
    'Talking Points', 
    "This table shows attention and sentiment values for all domains in the selected period. The values are compared to the previous period."
)

const TgAttentionTitle = nonHCTitleInfo(
    'Attention',
    'This chart shows the attention values for all domains in the selected period. The values are compared to the previous period.' 
)


const TgAttentionTrendsInfo = `
    test
`
const TgHotTopicsInfo = `
    Based on a custom taxonomy developed for 117 topics of interest to FEWS NET, the Hot Topics visualization presents the distribution of topics by calculating the frequency of a topic in a data stream, where any value above 0 counts as presence. 
`

var tooltipTriggerList, tooltipList;

function initializeBootstrapTooltips(){
    tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        }); 
}

function deleteAllBoostrapTooltips(){
    // this is due to the fact that tooltips in non highcharts elements are created every time
    // a chart (like Talking point) is reloaded, so they accumulate (I think this would mess up things)


    // Assicurati che tooltipList contenga tutti i tooltip creati
    if (tooltipList && Array.isArray(tooltipList)) {
        tooltipList.forEach(function (tooltip) {
            tooltip.dispose();
    });
    // Pulisci l'array tooltipList
    tooltipList = [];
    }
}
// window.dateRanges["si"] = [20111227, 20231231];  // check why I hardcoded this daterange
if (!window.dateRanges || !window.dateRanges.hasOwnProperty('tg')) {
    window.dateRanges = window.dateRanges || {}; 
    window.dateRanges.tg = [null, null];
}
if (!window.dateRanges|| !window.dateRanges.hasOwnProperty('mc')) {
    window.dateRanges = window.dateRanges || {}; 
    window.dateRanges.mc = [null, null];
}
if (!window.dateRanges || !window.dateRanges.hasOwnProperty('si')) {
    window.dateRanges = window.dateRanges || {}; 
    window.dateRanges.si = [null, null];
}
try {
    window.tgStartDate = parseInt(moment(window.dateRanges.tg[1].toString()).subtract(7, 'days').format('YYYYMMDD'));
    window.tgEndDate = window.dateRanges.tg[1];
} catch {
    window.tgStartDate = defaultStartDateInt;
    window.tgEndDate = defaultEndDateInt;

}
try {
    window.mcStartDate = parseInt(moment(window.dateRanges.mc[1].toString()).subtract(7, 'days').format('YYYYMMDD'));
    window.mcEndDate = window.dateRanges.mc[1];
} catch {
    window.mcStartDate = defaultStartDateInt;
    window.mcEndDate = defaultEndDateInt;
}
try {
    window.siStartDate = parseInt(moment(window.dateRanges.si[1].toString()).subtract(365, 'days').format('YYYYMMDD'));
    window.siEndDate = window.dateRanges.si[1];
} catch {
    window.siStartDate = defaultStartDateInt;
    window.siEndDate = defaultEndDateInt;
}
try {
    window.mcCalendarMin = moment(window.dateRanges.mc[0].toString());
    window.mcCalendarMax = moment(window.dateRanges.mc[1].toString());
} catch {
    window.mcCalendarMin = moment(defaultStartDateInt.toString());
    window.mcCalendarMax = moment(defaultEndDateInt.toString())
}
try {
    window.tgCalendarMin = moment(window.dateRanges.tg[0].toString());
    window.tgCalendarMax = moment(window.dateRanges.tg[1].toString());
} catch {
    window.tgCalendarMin = moment(defaultStartDateInt.toString());
    window.tgCalendarMax = moment(defaultEndDateInt.toString())
}
try {
    window.siCalendarMin = moment(window.dateRanges.si[0].toString());
    window.siCalendarMax = moment(window.dateRanges.si[1].toString());
} catch {
    window.siCalendarMin = moment(defaultStartDateInt.toString());
    window.siCalendarMax = moment(defaultEndDateInt.toString())
}
try {
    let minRange, maxRange, dateMins, dateMaxs;
    dateMins = [window.dateRanges.mc[0], window.dateRanges.tg[0], window.dateRanges.si[0]];
    dateMaxs = [window.dateRanges.mc[1], window.dateRanges.tg[1], window.dateRanges.si[1]];
    dateMins = dateMins.filter(element => element !== null);
    dateMaxs = dateMaxs.filter(element => element !== null);
    if (dateMins.length > 0 & dateMaxs.length >0) {
        let dateMin = Math.min(...dateMins);
        let dateMax = Math.max(...dateMaxs);
        window.dateRanges['oa'] = [dateMin, dateMax]
        window.oaCalendarMin = moment(window.dateRanges.oa[0].toString());
        window.oaCalendarMax = moment(window.dateRanges.oa[1].toString());
    } else {
        window.dateRanges['oa'] = [defaultStartDateInt, defaultEndDateInt];
        window.oaCalendarMin = moment(defaultStartDateInt.toString());
        window.oaCalendarMax = moment(defaultEndDateInt.toString());
    }
    
} catch {
    window.dateRanges['oa'] = [defaultStartDateInt, defaultEndDateInt];

    window.oaCalendarMin = moment(defaultStartDateInt.toString());
    window.oaCalendarMax = moment(defaultEndDateInt.toString());
}
try {
    window.oaStartDate = parseInt(moment(window.dateRanges.oa[1].toString()).subtract(365, 'days').format('YYYYMMDD'));
    window.oaEndDate = window.dateRanges.oa[1];
} catch {
    window.oaStartDate = defaultStartDateInt;
    window.oaEndDate = defaultEndDateInt;
}
// hardcoding because mediacloud entities are less recent than metadata, so default is not empty
// window.mcStartDate = 20240101
// window.mcEndDate = 20240108




window.conditionCounter = {
    "tg": 0, "mc": 0, "si": 0, "oa": 0
};
window.countryConditions = {
    "tg": [], "mc": [], "oa": []
}

window.MessagesOffset = {
    "tg": 0, "mc": 0
};
window.MessagesLimit = {
    "tg": 10, "mc": 10
}
window.startDates = {
    'tg': [window.tgStartDate, window.tgEndDate],
    'mc': [window.mcStartDate, window.mcEndDate],
    'si': [window.siStartDate, window.siEndDate],
    'oa': [window.oaStartDate, window.oaEndDate]
}

window.tgMessageMaxLen = 300;
window.mcStoryMaxLen = 300;
const sleep = ms => new Promise(r => setTimeout(r, ms));


const noDataHTML = `
    <div class="d-flex justify-content-center align-items-center h-100">
        <div class="fews-country"> NO DATA AVAILABLE</div>
    </div>
`;


Highcharts.setOptions({
	chart: {
		styledMode: true,
		borderRadius: 5,
        //height: '100%'
	},
	credits: {
		text: '',
	},
	title: {
		align: "left",
	},
	xAxis: {
		title: {
			margin: 8,
		},
		labels: {
			rotation: 0,
		},
	},
	yAxis: {
		title: {
			margin: 8,
		},
	},
});

function isHTML(str) {
    // Crea un elemento DOM temporaneo
    let doc = new DOMParser().parseFromString(str, 'text/html');

    // Controlla se l'elemento ha figli
    return Array.from(doc.body.childNodes).some(node => node.nodeType === 1);
}

const infoCallBack = function() {
    const chart = this,
        info = document.querySelector('#info');
        
        console.log(chart);
        
    info.addEventListener('mouseover', function() {
        if (!chart.infoTooltip) {
            chart.infoTooltip = chart.renderer.label('Title tooltip info', 10, 10).attr({
                zIndex: 12,
                fill: '#fff',
                'stroke-width': 1,
                stroke: 'black',
                padding: 8,
                r: 3,
            }).add();
        }
        
        const bBox = chart.infoTooltip.getBBox(),
            titleBBox = chart.title.getBBox(),
            x = chart.title.x + titleBBox.width / 2 - bBox.width / 2 - 12,
            y = chart.title.y + titleBBox.height / 2;
        
        chart.infoTooltip.show();
        chart.infoTooltip.attr({x, y})
    });
    info.addEventListener('mouseout', function() {
        chart.infoTooltip.hide();
    });
}


function setupCollapsibleTopicGroups(eleId){
    let element = document.querySelector(eleId);
    let select = element.virtualSelect;
    let collapsedGroups = new Set(
        select.options.filter(option => option.isGroupTitle).map(option => option.index)
    );
    let afterSetVisibleOptionsCount = select.afterSetVisibleOptionsCount.bind(select);
    let afterRenderOptions = select.afterRenderOptions.bind(select);

    function applyCollapsedGroups(){
        if (select.searchValue){
            return;
        }
        select.options.forEach(option => {
            if (option.isGroupOption && collapsedGroups.has(option.groupIndex)){
                option.isVisible = false;
            }
        });
        select.visibleOptionsCount = select.options.filter(option => option.isVisible).length;
    }

    function markGroupState(){
        select.$options.querySelectorAll('.vscomp-option.group-title').forEach(group => {
            let isExpanded = !collapsedGroups.has(parseInt(group.dataset.index));
            let toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'topic-group-toggle';
            toggle.setAttribute('aria-label', `${isExpanded ? 'Collapse' : 'Expand'} ${group.textContent.trim()}`);
            toggle.textContent = isExpanded ? '-' : '+';
            group.dataset.expanded = isExpanded.toString();
            group.setAttribute('aria-expanded', isExpanded.toString());
            group.appendChild(toggle);
        });
    }

    select.afterSetVisibleOptionsCount = function (){
        applyCollapsedGroups();
        afterSetVisibleOptionsCount();
    };
    select.afterRenderOptions = function (){
        afterRenderOptions();
        markGroupState();
    };
    element.addEventListener('click', function (event){
        let toggle = event.target.closest('.topic-group-toggle');
        if (!toggle || !element.contains(toggle)){
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        let group = toggle.closest('.vscomp-option.group-title');
        let groupIndex = parseInt(group.dataset.index);
        if (collapsedGroups.has(groupIndex)){
            collapsedGroups.delete(groupIndex);
        } else {
            collapsedGroups.add(groupIndex);
        }
        select.setVisibleOptionsCount();
    }, true);
    select.setVisibleOptionsCount();
}

function initTopicField(eleId){
    const a = {};
    window.topics.forEach( t => {
        if (!a[t.domain]) {
            a[t.domain] = [];
          }
          a[t.domain].push({"label": t.topic, "value": t.topic_id});
    })
    
    const groupedOptions = Object.keys(a).map(key => ({
        label: key,
        options: a[key]
    }));
    // placeHolder = `-- ${placeHolder} [${options.length}] --`
    VirtualSelect.init({
      ele: eleId,
      options: groupedOptions,
      multiple: true,
      search: true,
      searchGroup: true,
      markSearchResults: true,
      searchPlaceholderText: 'Search topics...',
      disableSelectAll: true,
      showSelectedOptionsFirst: true,
      placeholder: 'Select topic...'
    }
    )
    setupCollapsibleTopicGroups(eleId);
  }
  

function reflowCharts(){
    $('.hcs').each(function (){
        let chart = jQuery(this).highcharts();
            if (chart){
                chart.reflow();
            }
})};

async function DomainRanking(containerId, stream, title='Hot Topics') {
    let hashContainerId = '#' + containerId;
    $(hashContainerId).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let startD, endD; 
    endD = stream == "mc" ? window.mcEndDate : window.tgEndDate;
    startD = stream == "mc" ? window.mcStartDate : window.tgStartDate;

    let base_endpoint = `/${window.country}/domain_ranking`;
    let queryParams = $.param(
        topicScopedParams({
            start_date: startD,
            end_date: endD,
            stream: stream
        }, stream),
        true
    ); 
    let mappingKeys = {'categoryKey': 'domain', 'valueKey': 'frequency'};
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {
        titleText: title,
        titleUseHTML: isHTML(title),
        infoTooltipText: TgHotTopicsInfo
    };

    await renderBarChartFromUrl(
        containerId, url, mappingKeys, customOptions);
};

async function AttentionTrends(containerId, stream, endpoint='/attention_trends', trendtype='', title='Attention', conditions=[], chartType='line', customKeys=[]) {
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let startD, endD;
    startD = window.startDates[stream][0];
    endD = window.startDates[stream][1];

    let base_endpoint = `/${window.country}${endpoint}`;
    let queryParams = $.param(
        scopedParams({
            start_date: startD,
            end_date: endD,
            stream: stream,
            trend_type: trendtype,
            conditions: JSON.stringify(conditions)
        }),
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {
        titleText: title,
        titleUseHTML: isHTML(title),
        chartType: chartType}
    await renderTimeSeriesFromUrl(
        containerId, url, customOptions, 'date', customKeys
    )
    
};


async function overallTrends(containerId, stream, endpoint='/attention_trends', trendtype='', title='Attention', conditions=[], chartType='line', customKeys=[]) {
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let startD, endD;
    startD = window.startDates[stream][0];
    endD = window.startDates[stream][1];

    let base_endpoint = `/${window.country}${endpoint}`;
    let queryParams = $.param(
        scopedParams({
            start_date: startD,
            end_date: endD,
            stream: stream,
            trend_type: trendtype,
            conditions: JSON.stringify(conditions)
        }),
        true
    );
    let url = base_endpoint + '?' + queryParams;
    
    let customOptions = {
        titleText: title, 
        titleUseHTML: isHTML(title),
        chartType: chartType,
        tooltipPointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y}</b><br/>Anomalous Topics: {point.topic_names}'
    }
    await renderOverallTimeSeriesFromUrl(
        containerId, url, customOptions, 'date', customKeys
    )
};


async function EmotionTrends(containerId, stream, conditions='', customOptions={}) {
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let startD, endD;
    startD = stream == "mc" ? window.mcStartDate : window.tgStartDate;
    endD = stream == "mc" ? window.mcEndDate : window.tgEndDate;

    let base_endpoint = `/${window.country}/emotion_trends`;
    let queryParams = $.param(
        scopedParams({
            start_date: startD,
            end_date: endD,
            stream: stream,
            conditions: conditions
        }),
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let emotionOptions = {titleText: 'Emotion Trends'}
    let combinedOptions = {...emotionOptions, ...customOptions}
    combinedOptions['titleUseHTML'] = isHTML(combinedOptions.titleText);
    await renderTimeSeriesFromUrl(
        containerId, url, combinedOptions, 'date'
    )
};


async function WordCloud(containerId, stream, title='Significant Terms') {

    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let startD, endD;
    startD = stream == "mc" ? window.mcStartDate : window.tgStartDate;
    endD = stream == "mc" ? window.mcEndDate : window.tgEndDate;

    let base_endpoint = `/${window.country}/tfidf_top_terms`;
    let queryParams = $.param(
        scopedParams({
            start_date: startD,
            end_date: endD,
            stream: stream,
            limit: 50,
            metric: window.tfidfMetric,
            max_document_frequency: 0.80
        }),
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {
        titleText: title,
        titleUseHTML: isHTML(title),
        chartHeightRatio: null,
        chartWidth: null,
        seriesName: window.tfidfMetric === 'daily_peak' ? 'Daily TF-IDF' : 'Period average'
    }
    let mappingKeys = {'categoryKey': 'lemma', 'valueKey': 'mean_value', 'dateKey': 'date_id'};
    try {
        await fetch(url)
            .then(response => response.json())
            .then(data => {
                    if (data.length == 0 ) {
                        $(`#${containerId}`).html(noDataHTML);
                    } else {

                        renderWordCloud(containerId, data, mappingKeys, customOptions);
                    }
            });
    } catch {
        $(`#${containerId}`).html(noDataHTML);
    }
    reflowCharts();

}
async function SSITimeline(containerId, domainId, customOptions, stream='si'){
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let base_endpoint = `/${window.country}/ssi_series`;
    
    
    if (Array.isArray(domainId)){
        domainId = JSON.stringify(domainId)
    }
    let queryParams = $.param(
        {
            start_date: window.startDates[stream][0],
            end_date: window.startDates[stream][1],
            domain_id: domainId
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    customOptions['titleUseHTML'] = isHTML(customOptions.titleText);
    await renderTimeSeriesFromUrl(
        containerId, url, customOptions, 'date'
    )

};

async function SSIFieldsTimeline(containerId, domainId, customOptions, fieldIds=null, stream='si'){
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let base_endpoint = `/${window.country}/ssi_fields_series`;
    let queryParams = {
        start_date: window.startDates[stream][0],
        end_date: window.startDates[stream][1],
        domain_id: domainId
    };
    if (fieldIds) {
        queryParams.field_ids = JSON.stringify(fieldIds);
    }
    queryParams = $.param(queryParams, true);
    let url = base_endpoint + '?' + queryParams;
    customOptions['titleUseHTML'] = isHTML(customOptions.titleText);
    await renderTimeSeriesFromUrl(
        containerId, url, customOptions, 'date'
    )

};

async function HumanMobilitySSIFieldsTimeline(containerId, customOptions, stream='si'){
    return SSIFieldsTimeline(containerId, 5, customOptions, [15, 16, 18], stream);
}

async function ScopeAwareSSIFieldsTimeline(containerId, customOptions, stream='si'){
    if (isHumanMobilityScope()){
        return HumanMobilitySSIFieldsTimeline(containerId, customOptions, stream);
    }
    return SSITimeline(containerId, [3, 5], customOptions, stream);
}

async function SearchInterestSection(){
    if (isHumanMobilityScope()){
        $('#si-human-mobility-section').show();
        $('#si-global-section').hide();
        return HumanMobilitySSIFieldsTimeline('si-human-mobility-fields', {titleText: ''});
    }
    $('#si-human-mobility-section').hide();
    $('#si-global-section').show();
    SSITimeline('si-food-insecurity', 3, {titleText: ''});
    SSIFieldsTimeline('si-food-insecurity-fields', 3, {titleText: ''});
    SSITimeline('si-conflict-total', 5, {titleText: ''});
    return SSIFieldsTimeline('si-conflict-total-fields', 5, {titleText: ''});
}

function extractLatestValue(htmlString) {
    // Crea un nuovo documento DOMParser
    let parser = new DOMParser();
    let doc = parser.parseFromString(htmlString, 'text/html');
    
    // Trova il primo span e ne estrae il contenuto
    let latestSpan = doc.querySelector('span');
    return latestSpan ? parseFloat(latestSpan.textContent) : 0;
}

async function TalkingPoints(containerId, stream, endP='/talking_points_on_conditions', conditions=""){
    $(`#${containerId}`).html('<div class="h-100 d-flex justify-content-center align-items-center"><div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div></div>');
    let base_endpoint = `/${window.country}${endP}`;
    let startD, endD;
    startD = stream == "mc" ? window.mcStartDate : window.tgStartDate;
    endD = stream == "mc" ? window.mcEndDate : window.tgEndDate;
    
    let queryParams = $.param(
        topicScopedParams({
            start_date: startD,
            end_date: endD,
            stream: stream,
            conditions: conditions
        }, stream),
        true
    );
    let url = base_endpoint + '?' + queryParams;
    // let customOptions = {titleText: TgTalkingPointsTitle};
    let customOptions = {};
    await fetch(url).then(
        response => response.json()
    ).then(data => {
        if (data.length == 0) {
            $(`#${containerId}`).html(noDataHTML);
        } else {
        let dataCopy = [...data]
        var r = {};
        dataCopy.forEach(function(i) {
            
            var layer = i.layer;
            let latest_value, prev_value, delta, percentSign, color, arrowVerse;

            if (!r[i.domain]) {
                r[i.domain] = {};
            }
            if (layer === "attention"){
                latest_value = i.latest_value.toExponential(1);
                if (i.prev_value == null) {
                    delta = 'N/A';
                    color = 'white';  // dummy
                    percentSign = '';
                    
                
                } else {
                    delta = ((i.latest_value - i.prev_value)/i.prev_value)*100
                    if (i.prev_value == 0){
                        delta = '+Inf';
                        percentSign = '';
                        color = 'green';
                        arrowVerse = "up";
                    } else {
                        color = delta >= 0 ? 'green' : 'red';
                        arrowVerse = delta >= 0 ? 'up' : 'down';
                        percentSign = ' %'
                        delta = delta.toFixed(1).replace('-', '')

                    }
                }
            } else {
                latest_value = i.latest_value.toFixed(1);
                if (i.prev_value == null) {
                    delta = 'N/A';
                    color = 'white';  // dummy
                    
                } else {
                    delta = i.latest_value - i.prev_value;
                    color = delta >= 0 ? 'green' : 'red';
                    arrowVerse = delta >= 0 ? 'up' : 'down';
                    delta = delta.toFixed(1).replace('-', '')
                }
                
                percentSign = '';
            }
            
           
            latest_value = `<span class="tp-latest" style="padding-right: 0.5rem;">${latest_value}</span>`;
            prev_value = `<span class="tp-delta" style="color: ${color}">${delta}${percentSign}</span>`
            r[i.domain][layer] = `${latest_value}  <i class="fa-solid fa-arrow-${arrowVerse}" style="color: ${color}"></i>  ${prev_value}`;
        });

        var out = [];
        
        for (var dd in r) {
            if (r.hasOwnProperty(dd)) {
                var values = r[dd];
                var item = {
                    "Domain": dd,
                    "Attention": values["attention"] || "", 
                    "Sentiment": values["sentiment"] || ""
                };
                out.push(item);
            }
        }
        
        out = out.sort((a, b) => {
            // Estrai latest_value dalla stringa "latest_value -- prev_value"
            let latestValueA = extractLatestValue(a.Attention);
            let latestValueB = extractLatestValue(b.Attention);
            // Confronta i valori per ordinare in ordine decrescente
            return latestValueB - latestValueA;
        });
        
        renderHTMLTable(containerId, out, customOptions);
        reflowCharts();
        deleteAllBoostrapTooltips();
        initializeBootstrapTooltips();
    }
    })

};

async function MCPersons(tableId) {
    $(`#${tableId}`).html('<div class="h-100 d-flex justify-content-center align-items-center"><div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div></div>');
    let base_endpoint = `/${window.country}/mc_entity_in_period`;
    let queryParams = $.param(
        {
            start_date: window.mcStartDate,
            end_date: window.mcEndDate,
            entity: 'person',
            limit: 10
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: "People"};
    await fetch(url).then(
        response => response.json()
    ).then(data => {
        if (data.length == 0) {
            $(`#${tableId}`).html(noDataHTML);
        } else {
            var out = [];
            
            data.forEach(function(d) {
                
                let entity = `<span class="mc-entity">${d.person}</span>`;
                let coverage = `<span class="mc-entity-coverage">${(d.value*100).toFixed(2)}%</span>`
                out.push({"Person": entity, "Coverage": coverage})
            });
            renderHTMLTable(tableId, out, customOptions);
            reflowCharts();
        }
    })
};

async function MCLocations(tableId) {
    $(`#mc-locations`).html('<div class="h-100 d-flex justify-content-center align-items-center"><div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div></div>');

    let base_endpoint = `/${window.country}/mc_entity_in_period`;
    let queryParams = $.param(
        {
            start_date: window.mcStartDate,
            end_date: window.mcEndDate,
            entity: 'location',
            limit: 10
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: 'Places'};
    await fetch(url).then(
        response => response.json()
    ).then(data => {
        if (data.length == 0) {
            $(`#${tableId}`).html(noDataHTML);
        } else {
            var out = [];
            
            data.forEach(function(d) {
                
                let entity = `<span class="mc-entity">${d.location}</span>`;
                let coverage = `<span class="mc-entity-coverage">${(d.value*100).toFixed(2)}%</span>`
                out.push({"Location": entity, "Coverage": coverage})
            });
            renderHTMLTable(tableId, out, customOptions);
            reflowCharts();
        }
    })


};

async function MCOrgs(tableId) {
    $(`#mc-orgs`).html('<div class="h-100 d-flex justify-content-center align-items-center"><div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div></div>');

    let base_endpoint = `/${window.country}/mc_entity_in_period`;
    let queryParams = $.param(
        {
            start_date: window.mcStartDate,
            end_date: window.mcEndDate,
            entity: 'org',
            limit: 10
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: 'Organisations'};
    await fetch(url).then(
        response => response.json()
    ).then(data => {
        if (data.length == 0) {
            $(`#${tableId}`).html(noDataHTML);
        } else {
            var out = [];
            
            data.forEach(function(d) {
                
                let entity = `<span class="mc-entity">${d.org}</span>`;
                let coverage = `<span class="mc-entity-coverage">${(d.value*100).toFixed(2)}%</span>`
                out.push({"Org": entity, "Coverage": coverage})
            });
            renderHTMLTable(tableId, out, customOptions);
            reflowCharts();
        }
    })

};


function initPicker(pickerId, stream) {
    let start, end, startDate, endDate;
    if (stream === 'tg'){
        start = window.tgCalendarMin;
        end = window.tgCalendarMax;
    } else if (stream === 'mc') {
        start = window.mcCalendarMin;
        end = window.mcCalendarMax;
    } else if (stream === 'si') {
        start = window.siCalendarMin;
        end = window.siCalendarMax;
    } else if (stream === 'oa') {
        start = window.oaCalendarMin;
        end = window.oaCalendarMax;
    }
    startDate = window.startDates[stream][0] ? moment(window.startDates[stream][0].toString()) : null;
    endDate = window.startDates[stream][1] ? moment(window.startDates[stream][1].toString()) : null;

    function cb(start, end) {
        $(`#${pickerId} span`).html(start.format('DD/MM/YYYY') + ' - ' + end.format('DD/MM/YYYY'));
    }
    $(`#${pickerId}`).daterangepicker({
        startDate: startDate,
        endDate: endDate,
        minDate: start,
        maxDate: end,
        linkedCalendars: false,
        showDropdowns: true,
        autoApply: true
    }, cb);
    if (startDate){
        cb(startDate, endDate);
    }
};


function conditionTemplate(index, stream, logicDiv){
    return `<div class="condition" id="${stream}-condition-${index}">
        ${logicDiv}
        <div class="d-flex justify-content-center align-items-center">
            <div class="field-condition sub-condition">
                <label for="${stream}-field-select-${index}">Field:</label><br>
                <select id="${stream}-field-select-${index}" class="field-select">
                    
                </select>
            </div>
            <div class="operator-condition sub-condition">
                <label for="${stream}-operator-select-${index}">Operator:</label><br>
                <select id="${stream}-operator-select-${index}">
                    
                </select>
            </div>
            <div class="value-condition sub-condition wrapper">
                <label for="${stream}-value-condition-${index}">Value:</label><br>
                <div class="value-condition sub-condition vscontainer" id="${stream}-value-condition-${index}">
            </div>
            </div>
            <div class="d-flex justify-content-center align-items-center">
                <div  id="${stream}-remove-condition-${index}" class="condition-mod icon" value="Remove"> 
                    <img src="/static/img/trash-bin.svg"  alt="">
                </div> 
                <div  id="${stream}-and-condition-${index}" class="condition-mod icon add-filter" value="And">
                    <img src="/static/img/plus-sign.svg"  alt="">
                </div>
            </div>
            
        </div>
    </div> 
    `

}
$('#tg-filter-bar .datepicker').on('apply.daterangepicker', function(ev, picker) {
    window.tgStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.tgEndDate = parseInt(picker.endDate.format('YYYYMMDD'));

    window.startDates['tg'][0] = parseInt(picker.startDate.format('YYYYMMDD'));
    window.startDates['tg'][1] = parseInt(picker.endDate.format('YYYYMMDD'));

    let start_date = window.tgStartDate;
    let end_date = window.tgEndDate;
    let stream = 'tg';
    let base_endpoint = `/${window.country}/filter_attention_trends`;
    let queryParams = $.param(
        topicScopedParams({
            start_date: start_date,
            end_date: end_date,
            conditions: JSON.stringify(window.countryConditions[stream]),
            stream: stream
        }, stream),
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: ''}
    TgMessageWidget();
    $(`#${stream}-attention-trends`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    renderTimeSeriesFromUrl(
        `${stream}-attention-trends`, url, customOptions, 'date'
    )

    let hotTopicsEndpoint = `/${window.country}/domain_ranking`;
    let hotUrl = hotTopicsEndpoint + '?' + queryParams;
    customOptions = {titleText: ''};
    let hasTopic = window.countryConditions[stream].some(obj => obj.field === 'Topic');
    let categoryKey = hasTopic ? 'topic' : 'domain';
    let mappingKeys = {'categoryKey': categoryKey, 'valueKey': 'frequency'};
    $(`#${stream}-domains-bar-chart`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    renderBarChartFromUrl(
        `${stream}-domains-bar-chart`, hotUrl, mappingKeys, customOptions);

    $(`#${stream}-talking-points`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');        
    TalkingPoints(
        `${stream}-talking-points`, stream, 
        '/talking_points_on_conditions', JSON.stringify(window.countryConditions[stream]));
    EmotionTrends(
        `${stream}-emotion-trends`, stream,  JSON.stringify(window.countryConditions[stream]),
        {titleText: ''}
    );

    WordCloud('tg-top-terms', 'tg', '');
    CorpusSummary(stream);
    fillSearchBar(stream);

});

$('#mc-filter-bar .datepicker').on('apply.daterangepicker', function(ev, picker) {
    window.mcStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.mcEndDate = parseInt(picker.endDate.format('YYYYMMDD'));
    window.startDates['mc'][0] = parseInt(picker.startDate.format('YYYYMMDD'));
    window.startDates['mc'][1] = parseInt(picker.endDate.format('YYYYMMDD'));

    let start_date = window.mcStartDate;
    let end_date = window.mcEndDate;
    let stream = 'mc';
    let base_endpoint = `/${window.country}/filter_attention_trends`;
    let queryParams = $.param(
        topicScopedParams({
            start_date: start_date,
            end_date: end_date,
            conditions: JSON.stringify(window.countryConditions[stream]),
            stream: stream
        }, stream),
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: ''}
    $(`#${stream}-attention-trends`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    renderTimeSeriesFromUrl(
        `${stream}-attention-trends`, url, customOptions, 'date'
    )

    let hotTopicsEndpoint = `/${window.country}/domain_ranking`;
    let hotUrl = hotTopicsEndpoint + '?' + queryParams;
    customOptions = {titleText: ''};
    let hasTopic = window.countryConditions[stream].some(obj => obj.field === 'Topic');
    let categoryKey = hasTopic ? 'topic' : 'domain';
    let mappingKeys = {'categoryKey': categoryKey, 'valueKey': 'frequency'};
    $(`#${stream}-domains-bar-chart`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    renderBarChartFromUrl(
        `${stream}-domains-bar-chart`, hotUrl, mappingKeys, customOptions);

    $(`#${stream}-talking-points`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');        
    TalkingPoints(
        `${stream}-talking-points`, stream, 
        '/talking_points_on_conditions', JSON.stringify(window.countryConditions[stream]))
    
    MCStoryWidget();
    CorpusSummary(stream);
    fillSearchBar(stream);
    EmotionTrends(
        `${stream}-emotion-trends`, stream, JSON.stringify(window.countryConditions[stream]),
        {titleText: ''}
    );

    // MCPersons('mc-persons');
    // MCLocations('mc-locations');
    // MCOrgs('mc-orgs');
    MCStoryWidget();
});
$('#si-filter-bar .datepicker').on('apply.daterangepicker', function(ev, picker) {
    window.siStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.siEndDate = parseInt(picker.endDate.format('YYYYMMDD'));
    window.startDates['si'][0] = parseInt(picker.startDate.format('YYYYMMDD'));
    window.startDates['si'][1] = parseInt(picker.endDate.format('YYYYMMDD'));

    SearchInterestSection();

});
$('#oa-filter-bar .datepicker').on('apply.daterangepicker', function(ev, picker) {
    window.oaStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.oaEndDate = parseInt(picker.endDate.format('YYYYMMDD'));
    window.startDates['oa'][0] = parseInt(picker.startDate.format('YYYYMMDD'));
    window.startDates['oa'][1] = parseInt(picker.endDate.format('YYYYMMDD'));

    let start_date = window.oaStartDate;
    let end_date = window.oaEndDate;
    let stream = 'oa';
    let conditions = window.countryConditions['oa'];
    overallTrends('oa-anomaly-trends', stream, '/overall_trend_hc', 'anomaly', '', conditions, 'column');
    AttentionTrends('oa-attention-trends', stream, '/overall_trend', 'attention', '', conditions);
    AttentionTrends('oa-sentiment-trends', stream, '/overall_trend', 'sentiment', '', conditions);
    ScopeAwareSSIFieldsTimeline('oa-ssi-trends', {titleText: ''}, stream);
    CorpusCoverageCharts();
    fillSearchBar(stream);
});

$('#oa-tab').on('show.bs.tab', function (e) {
    window.activeCountryStream = 'oa';
    updateTopicFilterModeControls();
    $('#oa-filter-bar').show();
    $('#mc-filter-bar').hide();
    $('#tg-filter-bar').hide();
    $('#si-filter-bar').hide();
});
$('#tg-tab').on('show.bs.tab', function (e) {
    window.activeCountryStream = 'tg';
    updateTopicFilterModeControls();
    $('#tg-filter-bar').show();
    $('#mc-filter-bar').hide();
    $('#si-filter-bar').hide();
    $('#oa-filter-bar').hide();

});
$('#mc-tab').on('show.bs.tab', function (e) {
    window.activeCountryStream = 'mc';
    updateTopicFilterModeControls();
    $('#mc-filter-bar').show();
    $('#tg-filter-bar').hide();
    $('#si-filter-bar').hide();
    $('#oa-filter-bar').hide();

});
$('#si-tab').on('show.bs.tab', function (e) {
    window.activeCountryStream = 'si';
    updateTopicFilterModeControls();
    $('#si-filter-bar').show();
    $('#mc-filter-bar').hide();
    $('#tg-filter-bar').hide();
    $('#oa-filter-bar').hide();

});

function createOption(elementId, key, value){
    var o = document.createElement("option");
    o.value = key;
    o.innerHTML = value;
    document.getElementById(elementId).appendChild(o);
}

function fillFields(stream, index){
    let filt = filterStructure[stream];
    for (let field in filt){
        createOption(`${stream}-field-select-${index}`, field, field);
    }
}

function fillOperatorAndValue(stream, index){
    let selectedField = $(`#${stream}-field-select-${index}`).val();
    let operators = filterStructure[stream][selectedField]["operators"];
    let value = filterStructure[stream][selectedField]["value"];
    try { 
        document.querySelector(`#${stream}-value-condition-${index}`).destroy();
    } catch {
        console.log("err")
    }
    $(`#${stream}-operator-select-${index}`).html('');
    $(`#${stream}-value-condition-${index}`).html('');
    operators.forEach((o) => {
        createOption(`${stream}-operator-select-${index}`, o, o);
    });
    if (selectedField.toLowerCase() == 'topic') {
        //document.querySelector(`#${stream}-value-condition-${index}`).destroy()
        initTopicField(`#${stream}-value-condition-${index}`)
    } else {
        $(`#${stream}-value-condition-${index}`).append(
            `<select id="${stream}-value-select-${index}"></select>`)
    value.forEach((o) => {
            createOption(`${stream}-value-select-${index}`, o, o);
        }
    )}
};

function fillForm(elementId){
    fillFields(elementId);
    fillOperatorAndValue(elementId);

}

function addCon(formId, logic=null){
    let stream = formId.split("-")[0];
    let i = window.conditionCounter[stream];
    let logicDiv;
    if (logic){
        logicDiv = `
            <div class="logic-container">
                <hr style="margin: 1px;">
                <div value="${logic}" class="logic" id="${stream}-logic-${i}">  ${logic}  </div>
                <hr style="margin: 1px">
            </div>`;
    } else {
        logicDiv = '';
    }
    let cond = conditionTemplate(i, stream, logicDiv);
    $(`#${formId}`).append(cond);
    fillFields(stream, i);
    fillOperatorAndValue(stream, i);
    window.conditionCounter[stream] += 1;
};


function TgAuthor(author){
    return `
    <div class="tg-author">${author}</div>
    `
}


function TgMessage(body){
    return `
    <div class="tg-message">${body}</div>
    `
}

function TgTimestamp(timestamp){
    return `
    <div class="tg-timestamp">${timestamp}</div>
    `
}

function TgMessageCard(author, url, body, timestamp, topics){
    return `
    <div class='mc-card mt-4 mb-4'>
        <div class="mc-message mb-4 mt-2">
            <div class="mb-2 tg-msg-text">
                <span>${truncate(body, window.tgMessageMaxLen)}</span>
                <span style="display: none;" class='full-text'>${body}</span>
                <span style="display: none;" class='detected-topics'>${topics}</span>
            <a href="${url}" target="_blank" style="margin-left: 1rem;">
                <i class="fa fa-external-link" style="color: white;">
                </i>
            </a>
            </div>
        
        </div>
        <br>
        <div class="mc-story-meta d-flex justify-content-between flex-wrap">
            <div class="mc-author">${author.split("/").slice(-1)[0]}</div>
            <br>
            <div class="mc-timestamp">${timestamp.split(":").slice(0, -1).join(":")}</div>
        </div>
    </div>
    `
}

function MCAuthor(author){
    return `
    <div class="mc-author">${author}</div>
    `
}


function MCStory(body){
    return `
    <div class="mc-story">${body}</div>
    `
}

function MCTimestamp(timestamp){
    return `
    <div class="mc-timestamp">${timestamp}</div>
    `
}
function truncate(str, n){
    return (str.length > n) ? str.slice(0, n-1) + '&hellip;' : str;
  };

function MCStoryCard(author, storyUrl, body, timestamp, topics){
    return `
    <div class='mc-card mt-4 mb-4'>
        <div class="mc-message mb-4 mt-2 mc-story-text">
            <a href="${storyUrl}" style="color: white;" class="link" target="_blank" rel="noopener noreferrer">${truncate(body, window.mcStoryMaxLen)}</a>
            <span style="display: none;" class='full-text'>${body}</span>
            <span style="display: none;" class='detected-topics'>${topics}</span>
        </div>
        <br>
        <div class="mc-story-meta d-flex justify-content-between">
            <div class="mc-author">${author}</div>
            <br>
            <div class="mc-timestamp">${timestamp.split("T")[0]}</div>
        </div>
    </div>
    `
}

function showMCPopup(evt) {
                  
    const fullText = $(this).find('.full-text').text();
    const topics = $(this).find('.detected-topics').text();
    let popup = $('#mc-story-popup');

    popup.find('.detected-topics span').text(`${topics}`);
    popup.find('.full-text span').text(`${fullText}`);
    // Ottieni le dimensioni del popup
    const popupWidth = popup.outerWidth();
    const popupHeight = popup.outerHeight();

    // Ottieni le dimensioni della finestra
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Ottieni la posizione del click
    const clickX = evt.clientX;
    const clickY = evt.clientY;

    // Calcola lo spazio disponibile
    const spaceRight = windowWidth - clickX;
    const spaceBottom = windowHeight - clickY;

    let top, left;

    
    // Determina dove posizionare il popup
    if (spaceRight >= popupWidth) {
        // C'è spazio a destra
        left = clickX;
    } else {
        // Posiziona a sinistra del click
        left = clickX - popupWidth;
    }

    if (spaceBottom >= popupHeight) {
        // C'è spazio in basso
        top = clickY;
    } else {
        // Posiziona sopra il click
        top = clickY - popupHeight;
    }

    popup.css({
      display: 'block',
    //   top: `${evt.clientY + window.scrollY}px`,
    //   left: `${evt.clientX + window.scrollX}px`,
        top: `${top + window.scrollY}px`,
      left: `${left + window.scrollX}px`
    });
  };

  function hideMCPopup() {
    $('#mc-story-popup').css('display', 'none');
  };


  function showTgPopup(evt) {
                  
    const fullText = $(this).find('.full-text').text();
    const topics = $(this).find('.detected-topics').text();
    let popup = $('#tg-message-popup');
    // const popup = document.getElementById('tg-message-popup');
    popup.find('.detected-topics span').text(`${topics}`);
    popup.find('.full-text span').text(`${fullText}`);

    // Ottieni le dimensioni del popup
    const popupWidth = popup.outerWidth();
    const popupHeight = popup.outerHeight();

    // Ottieni le dimensioni della finestra
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Ottieni la posizione del click
    const clickX = evt.clientX;
    const clickY = evt.clientY;

    // Calcola lo spazio disponibile
    const spaceRight = windowWidth - clickX;
    const spaceBottom = windowHeight - clickY;

    let top, left;

    
    // Determina dove posizionare il popup
    if (spaceRight >= popupWidth) {
        // C'è spazio a destra
        left = clickX;
    } else {
        // Posiziona a sinistra del click
        left = clickX - popupWidth;
    }

    if (spaceBottom >= popupHeight) {
        // C'è spazio in basso
        top = clickY;
    } else {
        // Posiziona sopra il click
        top = clickY - popupHeight;
    }

    
    popup.css({
      display: 'block',
    //   top: `${evt.clientY + window.scrollY}px`,
    //   left: `${evt.clientX + window.scrollX}px`
      top: `${top + window.scrollY}px`,
      left: `${left + window.scrollX}px`
    });
  };

  function hideTgPopup() {
    $('#tg-message-popup').css('display', 'none');
  };

async function MCStoryWidget(){
    let MAX_LEN = 300;
    if (window.MessagesOffset["mc"] == 0) {
        $(`#mc-stories`).html('<div class="h-100 d-flex justify-content-center align-items-center"><div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div></div>');
    }
    let base_endpoint = `/${window.country}/mc_stories`;
    let queryParams = $.param(
        scopedParams({
            start_date: window.mcStartDate,
            end_date: window.mcEndDate,
            conditions: JSON.stringify(window.countryConditions["mc"]),
            sorted_by: 'date',
            limit: window.MessagesLimit["mc"],
            offset: window.MessagesOffset["mc"]
        }),
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {};
    await fetch(url).then(
        response => response.json()
    ).then(data => {
        if (data.length == 0 && window.MessagesOffset["mc"] == 0) {
            $(`#mc-stories`).html(noDataHTML);
        } else {
            if (window.MessagesOffset["mc"] == 0){
                $(`#mc-stories`).html('');
                $('#mc-stories').append(
                    `
                    <div class="table-container" id="scrollable-stories">
                        <div class="" id="mc-stories-content">
                        </div>
                    </div>
                    `)
                    $('#scrollable-stories').scroll(function() {
                        if($(this).scrollTop() + $(this).innerHeight() >= $(this)[0].scrollHeight) {
                            window.MessagesOffset["mc"] += window.MessagesLimit["mc"];
                            MCStoryWidget();
                        }
                    });
            }
            data.forEach(function(d) {
                let author_username = d.username ? d.username : '';
                let body = d.body ? d.body : '';
                let url = d.url ? d.url : '';
                
                $('#mc-stories-content').append(
                    MCStoryCard(author_username, url, body, d.timestamp, d.detected_topics)

                )
                $('#mc-stories-content').append(
                    '<div class="cards-separator"></div>'
                )
            
            });
            //$('.mc-story-text').off('hover');
            document.querySelectorAll('.mc-story-text').forEach((s) => s.removeEventListener('mouseenter', showMCPopup) )
            document.querySelectorAll('.mc-story-text').forEach((s) => s.removeEventListener('mouseleave', hideMCPopup) )
            document.querySelectorAll('.mc-story-text').forEach((s) => s.addEventListener('mouseenter', showMCPopup) )
            document.querySelectorAll('.mc-story-text').forEach((s) => s.addEventListener('mouseleave', hideMCPopup) )


            reflowCharts();
        }
    })    

};


async function TgMessageWidget(){
    
    if (window.MessagesOffset["tg"] == 0) {
        $(`#tg-messages`).html('<div class="h-100 d-flex justify-content-center align-items-center"><div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div></div>');
    }

    let base_endpoint = `/${window.country}/tg_messages`;
    let queryParams = $.param(
        scopedParams({
            start_date: window.tgStartDate,
            end_date: window.tgEndDate,
            conditions: JSON.stringify(window.countryConditions["tg"]),
            entity: 'location',
            sorted_by: 'date',
            limit: window.MessagesLimit["tg"],
            offset: window.MessagesOffset["tg"]
            
        }),
        true
    );
    
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {};
    await fetch(url).then(
        response => response.json()
    ).then(data => {
        if (data.length == 0 && window.MessagesOffset["tg"] == 0) {
            $(`#tg-messages`).html(noDataHTML);
        } else {
            if (window.MessagesOffset["tg"] == 0) {
                $(`#tg-messages`).html('');
                $('#tg-messages').append(
                    `
                    <div class="table-container" id="scrollable-messages">
                        <div id="tg-messages-content">
                        </div>
                    </div>
                    `
                )
                $('#scrollable-messages').scroll(function() {
                    
                    if($(this).scrollTop() + $(this).innerHeight() >= $(this)[0].scrollHeight) {
                        window.MessagesOffset["tg"] += window.MessagesLimit["tg"];
                        TgMessageWidget();
                    }
                });
                
            }
            data.forEach(function(d) {
                let author_username = d.username ? d.username : '';
                let body = d.body ? d.body : '';
                let url = author_username + '/' + d.message_id.toString();
                $('#tg-messages-content').append(
                    TgMessageCard(author_username, url, body, d.timestamp, d.detected_topics)
                );
                $('#tg-messages-content').append(
                    '<div class="cards-separator"></div>'
                );
            
            });
            document.querySelectorAll('.tg-msg-text').forEach((s) => s.removeEventListener('mouseenter', showTgPopup) )
            document.querySelectorAll('.tg-msg-text').forEach((s) => s.removeEventListener('mouseleave', hideTgPopup) )
            document.querySelectorAll('.tg-msg-text').forEach((s) => s.addEventListener('mouseenter', showTgPopup) )
            document.querySelectorAll('.tg-msg-text').forEach((s) => s.addEventListener('mouseleave', hideTgPopup) )
            reflowCharts();
        }
    })
};

function prettyPrintConditions(conditions){
    let grouped = conditions.reduce((acc, item) => {
        const key = `${item.field}-${item.operator}`;
        if (!acc[key]) {
            
          acc[key] = {
            field: item.field,
            operator: item.operator,
            value: new Set()
          };
        }
        acc[key].value.add(item.value);
        return acc;
      }, {});
    let result = Object.values(grouped).map(group => ({
        field: group.field,
        operator: group.operator,
        value: Array.from(group.value)
      }));
      let parts = result.map(x => {
        let values = x.value.map(
            b => x.field.toLowerCase() == "topic" ? window.topicsById[b].toString() : b.toString()).join(', ');
        return `[${x.field} ${x.operator} (${values})]`;
      });
      
      return parts.join(' AND ');
};

function fillSearchBar(stream){
    if (window.countryConditions[stream].length > 0){
        $(`#${stream}-filter-bar .search-bar`).attr('placeholder', prettyPrintConditions(window.countryConditions[stream]))
    } else {
        $(`#${stream}-filter-bar .search-bar`).attr('placeholder', 'Build a query...')
    }
}

function renderTopicFilteredCharts(stream){
    let start_date = stream == 'mc' ? window.mcStartDate : window.tgStartDate;
    let end_date = stream == 'mc' ? window.mcEndDate : window.tgEndDate;
    let queryParams = $.param(
        topicScopedParams({
            start_date: start_date,
            end_date: end_date,
            conditions: JSON.stringify(window.countryConditions[stream]),
            stream: stream
        }, stream),
        true
    );
    let customOptions = {titleText: '', titleUseHTML: false};

    $(`#${stream}-attention-trends`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    renderTimeSeriesFromUrl(
        `${stream}-attention-trends`,
        `/${window.country}/filter_attention_trends?${queryParams}`,
        customOptions,
        'date'
    );

    let categoryKey = hasTopicCondition(stream) ? 'topic' : 'domain';
    $(`#${stream}-domains-bar-chart`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    renderBarChartFromUrl(
        `${stream}-domains-bar-chart`,
        `/${window.country}/domain_ranking?${queryParams}`,
        {'categoryKey': categoryKey, 'valueKey': 'frequency'},
        customOptions
    );

    TalkingPoints(
        `${stream}-talking-points`,
        stream,
        '/talking_points_on_conditions',
        JSON.stringify(window.countryConditions[stream])
    );
}




$(document).ready(async function (){
    

    $('#oa-filter-bar').show();
    $('#tg-filter-bar').hide();
    $('#mc-filter-bar').hide();
    $('#si-filter-bar').hide();
    $('.form-open').on('click', function (){
        
        let formOpen = $(this).closest('.filter-bar');
        let position = formOpen.position();
        let height = formOpen.outerHeight();
        $(this).closest('.filter-top').closest('.filter-bar').find('.builder-container')
        .css({
            top: position.top + height  ,
            left: position.left ,
            width: $(this).width()
          })
          .toggle();
        
        $('#modal-overlay').toggle();
    });
    $('#modal-overlay').on('click', function() {
        $('.builder-container').hide();
        $(this).hide();
      });

    function renderCharts(){
        overallTrends('oa-anomaly-trends', 'oa', '/overall_trend_hc', 'anomaly', "", window.countryConditions['oa'], 'column');
        AttentionTrends('oa-attention-trends', 'oa', '/overall_trend', 'attention', "", window.countryConditions['oa']);
        AttentionTrends('oa-sentiment-trends', 'oa', '/overall_trend', 'sentiment', "", window.countryConditions['oa']);
        ScopeAwareSSIFieldsTimeline('oa-ssi-trends', {titleText: ""}, 'oa');
        CorpusCoverageCharts();
        // fetch('/static/hc/oa-anomaly.json')  // Specifica il percorso al tuo file JSON
        //     .then(response => {
        //         if (!response.ok) {
        //             throw new Error('Errore nel caricamento del file JSON');
        //         }
        //         return response.json();  // Converte la risposta in formato JSON
        //     })
        //     .then(data => {
        //         console.log(data)
        //         data = processOverallChartData(data, 'date', [])
        //         let customOptions = {
        //             titleText: 'Topic Anomalies Example', 
        //             marginLeft: 10,
        //             chartType: 'column',
        //             tooltipPointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y}</b><br/>Anomalous Topics: {point.topic_names}'

        //         };
        //         renderTimeSeries('oa-anomaly-example', data, customOptions);

        //     })
        //     .catch(error => {
        //         console.error('Errore:', error);
        //     });
        

        DomainRanking('tg-domains-bar-chart', 'tg', '');
        AttentionTrends('tg-attention-trends', 'tg', '/attention_trends', 'attention', '');
        TalkingPoints('tg-talking-points', 'tg');
        EmotionTrends(`tg-emotion-trends`, 'tg', JSON.stringify(window.countryConditions['tg']), {titleText: ''});
        EmotionTrends(`mc-emotion-trends`, 'mc', JSON.stringify(window.countryConditions['mc']), {titleText: ''});

        DomainRanking('mc-domains-bar-chart', 'mc', '');
        AttentionTrends('mc-attention-trends', 'mc', '/attention_trends', 'attention', '');
        TalkingPoints('mc-talking-points', 'mc');
        // MCLocations('mc-locations');
        // MCPersons('mc-persons');
        // MCOrgs('mc-orgs');
        SearchInterestSection();

        TgMessageWidget();
        MCStoryWidget();
        CorpusSummary('tg');
        CorpusSummary('mc');
    };

    updateTopicFilterModeControls();
    updateTfidfMetricControl();
    updateCorpusCoverageIntervalControl();

    $('.topic-filter-option').on('click', function (){
        let stream = $(this).data('stream');
        let nextMode = $(this).data('topic-filter-mode');
        if (nextMode == topicFilterMode(stream)){
            return;
        }
        setTopicFilterMode(stream, nextMode);
        renderTopicFilteredCharts(stream);
    });

    $('.tfidf-metric-option').on('click', function (){
        let metric = $(this).data('tfidf-metric');
        if (metric === window.tfidfMetric){
            return;
        }
        setTfidfMetric(metric);
        WordCloud('tg-top-terms', 'tg', '');
    });

    $('.coverage-interval-option').on('click', function (){
        let interval = $(this).data('coverage-interval');
        if (interval === window.corpusCoverageInterval){
            return;
        }
        setCorpusCoverageInterval(interval);
        CorpusCoverageCharts();
    });


     function renderNonChartCards(){
        TalkingPoints('tg-talking-points', 'tg');
        TalkingPoints('tg-talking-points', 'tg');
        // MCLocations('mc-locations');
        // MCPersons('mc-persons');
        // MCOrgs('mc-orgs');
        TgMessageWidget();
        MCStoryWidget();

        reflowCharts();
    };
    async function renderElements(){
        addCon('tg-query-form');
        addCon('mc-query-form');
        addCon('oa-query-form');
        initPicker('tg-filter-bar .datepicker', 'tg');
        initPicker('mc-filter-bar .datepicker', 'mc');
        initPicker('si-filter-bar .datepicker', 'si');
        initPicker('oa-filter-bar .datepicker', 'oa')
        WordCloud('tg-top-terms', 'tg', '');
        renderCharts();
        
    };

    
    $(document).on('change', '.field-select', function (e) {
        let parts = $(this).attr('id').split('-');
        let stream = parts[0];
        let index = parts[parts.length - 1];
        fillOperatorAndValue(stream, index);
    });
    
    
    
    
    $(document).on('click', '.condition-mod', function(e){
        let logic = $(this).attr('value');
        let parts = $(this).attr('id').split('-');
        let stream = parts[0];
        let index = parts[parts.length - 1];
        if (logic.toLowerCase() == 'remove'){
            let conditionNumber = $(`#${stream}-query-form .condition`).length;
            if (!(conditionNumber == 1)){

                $(`#${stream}-condition-${index}`).remove();
            } 
            if ($(`#${stream}-query-form .condition`).length == 1){
                $(`#${stream}-query-form .condition .logic-container`).remove();
            };
            $($(`#${stream}-query-form .condition`).first()).find('.logic-container').remove()

        } else { 
            addCon(`${stream}-query-form`, logic);
            
        }
        
        
    });
    $('.reset-button').on('click', async function (){
        let parts = $(this).attr('id').split('-');
        let stream = parts[0];
        //window.conditionCounter[stream] = 0;
        window.countryConditions[stream] =  [];
        window.MessagesOffset[stream] = 0;
        if (['tg', 'mc'].includes(stream)){
            setTopicFilterMode(stream, 'strict');
        }
        $(`#${stream}-query-form`).html('');
        addCon(`${stream}-query-form`);
        renderCharts();
        fillSearchBar(stream);
    });

    $('.query-button').on('click', async function (){
        // ALARM:  aggiungere la country!!!
        let parts = $(this).attr('id').split('-');
        let stream = parts[0];
        let conditions = $(`#${stream}-query-form .condition`);
        let start_date = $(`#${stream}-filter-bar .datepicker`).data(
            'daterangepicker').startDate.format('YYYYMMDD')

        let end_date = $(`#${stream}-filter-bar .datepicker`).data(
                'daterangepicker').endDate.format('YYYYMMDD')
        start_date = parseInt(start_date);
        end_date = parseInt(end_date);   
        let payload = [];
        conditions.each(function() {
            let field = $($(this).find('.field-condition select')[0]).val();
            let operator = $($(this).find('.operator-condition select')[0]).val();
            let value;
            if (field.toLowerCase() == 'topic') {
                value = $($(this).find('.vscontainer')[0]).val();

            } else {
                value = $($(this).find('.value-condition select')[0]).val();
            }
            let logic = $(this).find('.logic');
            logic = logic.length > 0 ? $(logic).attr('value') : "";
            
            let selectedArray = Array.isArray(value) ? value : [value];
            selectedArray.forEach(v => 
                {
                payload.push(
                    {
                        
                        "field": field,
                        "operator": operator,
                        "value": v,
                        "logic": logic
                    }
            )})
        })
        window.countryConditions[stream] = payload
        if (window.countryConditions[stream].length == 0) {
            alert('Query empty. Select at least one field.')
            return
        }
        if (['tg', 'mc'].includes(stream)){
            updateTopicFilterModeControl(stream);
        }
        window.MessagesOffset[stream] = 0;
        $('.builder-container').hide();
        $('#modal-overlay').hide();
        if (['mc', 'tg'].includes(stream)){
            let base_endpoint = `/${window.country}/filter_attention_trends`;
            let queryParams = $.param(
                topicScopedParams({
                    start_date: start_date,
                    end_date: end_date,
                    conditions: JSON.stringify(window.countryConditions[stream]),
                    stream: stream
                }, stream),
                true
            );
            let url = base_endpoint + '?' + queryParams;
            let customOptions = {
                titleText: '',
                titleUseHTML: false
            }
            $(`#${stream}-attention-trends`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
            renderTimeSeriesFromUrl(
                `${stream}-attention-trends`, url, customOptions, 'date'
            )

            let hotTopicsEndpoint = `/${window.country}/domain_ranking`;
            let hotUrl = hotTopicsEndpoint + '?' + queryParams;
            customOptions = {
                titleText: '',
                titleUseHTML: false
            };
            let hasTopic = window.countryConditions[stream].some(obj => obj.field === 'Topic');
            let categoryKey = hasTopic ? 'topic' : 'domain';
            let mappingKeys = {'categoryKey': categoryKey, 'valueKey': 'frequency'};
            $(`#${stream}-domains-bar-chart`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
            renderBarChartFromUrl(
                `${stream}-domains-bar-chart`, hotUrl, mappingKeys, customOptions);

            
            // let talkingPointsEndpoint = `/${window.country}/talking_points_on_conditions`;
            // let talkingUrl = talkingPointsEndpoint + '?' + queryParams;
            //     await fetch(talkingUrl).then((response) => response.json()).then(data => {console.log(data)})

            $(`#${stream}-talking-points`).html('<div class="h-100 d-flex justify-content-center align-items-center"><div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div></div>');        
            TalkingPoints(
                `${stream}-talking-points`, stream, 
                '/talking_points_on_conditions', JSON.stringify(window.countryConditions[stream]))
            TgMessageWidget();
            MCStoryWidget();
            CorpusSummary(stream);
            EmotionTrends(
                `${stream}-emotion-trends`, stream, JSON.stringify(window.countryConditions[stream]),
                {titleText: ''}
            );
        } else if (stream == 'oa') {
            overallTrends('oa-anomaly-trends', stream, '/overall_trend_hc', 'anomaly', '', window.countryConditions[stream], 'column');
            AttentionTrends('oa-attention-trends', stream, '/overall_trend', 'attention', '' , window.countryConditions[stream]);
            AttentionTrends('oa-sentiment-trends', stream, '/overall_trend', 'sentiment', '' , window.countryConditions[stream]);
            ScopeAwareSSIFieldsTimeline('oa-ssi-trends', {titleText: ''}, stream);
        }
        fillSearchBar(stream);
        
    });

    
    jQuery(document).on('shown.bs.tab', 'button[data-bs-toggle="pill"]', function (e) {
        jQuery(".hcs").each(function() { 
            let chart = jQuery(this).highcharts();
            if (chart){
                chart.reflow();
            }
        });
    });
    
    jQuery(document).on('hidden.bs.collapse', function(e) {
        jQuery(".tab-pane.show.active").find('.hcs').each(function() {
            let chart = jQuery(this).highcharts();
            if (chart){
                chart.reflow();
            }
        });
    });
    
    document.querySelectorAll('.popup-trigger').forEach((s) => s.addEventListener('mouseenter', showInfoPopup) )
    document.querySelectorAll('.popup-trigger').forEach((s) => s.addEventListener('mouseleave', hideInfoPopup) )
  
    
    renderElements();
    
    
})
