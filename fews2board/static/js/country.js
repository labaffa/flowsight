import { renderBarChartFromUrl } from "./charts/bar-chart-module.js";
import { renderLineChartFromUrl } from "./charts/line-chart-module.js";
import { renderHTMLTableFromUrl } from "./charts/html-table.js";
import { renderHTMLTable } from "./charts/html-table.js";
import { filterStructure } from "./menu-module.js";

window.tgStartDate = window.latestUpdates.tg - 7;
window.tgEndDate = window.latestUpdates.tg;
window.mcStartDate = window.latestUpdates.mc - 7;
window.mcEndDate = window.latestUpdates.mc;

window.conditionCounter = {
    "tg": 0, "mc": 0, "si": 0
};


const sleep = ms => new Promise(r => setTimeout(r, ms));

Highcharts.setOptions({
	chart: {
		styledMode: true,
		borderRadius: 5,
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
async function DomainRanking(containerId, stream) {
    let hashContainerId = '#' + containerId;
    $(hashContainerId).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');

    let base_endpoint = `/${window.country}/domain_ranking`;
    let queryParams = $.param(
        {
            start_date: window.tgStartDate,
            end_date: window.tgEndDate,
            stream: stream
        },
        true
    );
    let mappingKeys = {'categoryKey': 'domain', 'valueKey': 'frequency'};
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {};

    await renderBarChartFromUrl(
        containerId, url, mappingKeys, customOptions);
};

async function AttentionTrends(containerId, stream) {
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    
    let base_endpoint = `/${window.country}/attention_trends`;
    let queryParams = $.param(
        {
            start_date: window.tgStartDate,
            end_date: window.tgEndDate,
            stream: stream
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {}
    await renderLineChartFromUrl(
        containerId, url, customOptions, 'date'
    )
};


async function SSITimeline(containerId){
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let base_endpoint = `/${window.country}/ssi_series`;
    let queryParams = $.param(
        {
            start_date: window.tgStartDate,
            end_date: window.tgEndDate,
            // here goes domain_id: some int
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {}
    await renderLineChartFromUrl(
        containerId, url, customOptions, 'date'
    )

};

async function TalkingPoints(containerId, stream){
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let base_endpoint = `/${window.country}/talking_points`;
    let queryParams = $.param(
        {
            start_date: window.tgStartDate,
            end_date: window.tgEndDate,
            stream: stream
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {};
    await fetch(url).then(
        response => response.json()
    ).then(data => {

        var r = {};
        
        data.forEach(function(i) {
            var layer = i.layer;
            let latest_value, prev_value;

            if (!r[i.domain]) {
                r[i.domain] = {};
            }
            if (layer === "attention"){
                i.latest_value = i.latest_value * 1000;
                i.prev_value = i.prev_value ? i.prev_value*1000 : i.prev_value;
            }
            let delta = ((i.latest_value - i.prev_value)/i.latest_value)*100
            i.prev_value = (i.prev_value) ? i.prev_value : '';
            latest_value = `<span class="tp-latest">${i.latest_value.toFixed(3)}</span>`;
            prev_value = `<span class="tp-delta">${delta}%</span>`
            r[i.domain][layer] = `${latest_value} ${prev_value}`;
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
        renderHTMLTable(containerId, out, customOptions);
    })

};

async function MCPersons(tableId) {
    $(`#${tableId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let base_endpoint = `/${window.country}/mc_entity_in_period`;
    let queryParams = $.param(
        {
            start_date: window.tgStartDate,
            end_date: window.tgEndDate,
            entity: 'person',
            limit: 10
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {};
    await fetch(url).then(
        response => response.json()
    ).then(data => {

        var out = [];
        
        data.forEach(function(d) {
            
            let entity = `<span class="mc-entity">${d.person}</span>`;
            let coverage = `<span class="mc-entity-coverage">${(d.value*100).toFixed(2)}%</span>`
            out.push({"Person": entity, "Coverage": coverage})
        });
        renderHTMLTable(tableId, out, customOptions);
    })
};

async function MCLocations(tableId) {
    $(`#mc-locations`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');

    let base_endpoint = `/${window.country}/mc_entity_in_period`;
    let queryParams = $.param(
        {
            start_date: window.tgStartDate,
            end_date: window.tgEndDate,
            entity: 'location',
            limit: 10
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {};
    await fetch(url).then(
        response => response.json()
    ).then(data => {

        var out = [];
        
        data.forEach(function(d) {
            
            let entity = `<span class="mc-entity">${d.location}</span>`;
            let coverage = `<span class="mc-entity-coverage">${(d.value*100).toFixed(2)}%</span>`
            out.push({"Location": entity, "Coverage": coverage})
        });
        renderHTMLTable(tableId, out, customOptions);
    })

};

async function MCOrgs(tableId) {
    $(`#mc-orgs`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');

    let base_endpoint = `/${window.country}/mc_entity_in_period`;
    let queryParams = $.param(
        {
            start_date: window.tgStartDate,
            end_date: window.tgEndDate,
            entity: 'org',
            limit: 10
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {};
    await fetch(url).then(
        response => response.json()
    ).then(data => {

        var out = [];
        
        data.forEach(function(d) {
            
            let entity = `<span class="mc-entity">${d.org}</span>`;
            let coverage = `<span class="mc-entity-coverage">${(d.value*100).toFixed(2)}%</span>`
            out.push({"Org": entity, "Coverage": coverage})
        });
        renderHTMLTable(tableId, out, customOptions);
    })

};


function initPicker(pickerId, stream) {
    let start, end;
    if (stream === 'tg'){
        start = window.dateRanges.tg[0].toString();
        end = window.dateRanges.tg[1].toString();
    } else if (stream === 'mc') {
        start = window.dateRanges.mc[0].toString();
        end = window.dateRanges.mc[1].toString();
    }
    console.log(stream, start, end)
    function cb(start, end) {
        $(`#${pickerId} span`).html(start.format('MMMM D, YYYY') + ' - ' + end.format('MMMM D, YYYY'));
    }
    $(`#${pickerId}`).daterangepicker({
        startDate: moment(end).subtract(7, 'days'),
        endDate: moment(end),
        minDate: moment(start),
        maxDate: moment(end),
        linkedCalendars: false,
        showDropdowns: true,
        autoApply: true
    }, cb);
};

function addConditionBkp() {
    var d = document.createElement("div");
    d.setAttribute("id", `condition-${conditionCounter}`);
    d.innerHTML =
        `<select id="column-${conditionCounter}"></select> <select id="compare-${conditionCounter}"></select> <input type="text" id="value-${conditionCounter}" />`
    document.getElementById("conditions").appendChild(d);

    var structure = tableStructure[activeTable]["structure"]
    for (var column in structure) {
        createTableOption(column, column, `column-${conditionCounter}`)
    }

    createTableOption("=", "is", `compare-${conditionCounter}`)
    createTableOption("<>", "is not", `compare-${conditionCounter}`)

    window.conditionCounter += 1
}

function conditionTemplate(index, stream){
    return `<div class="condition" id="${stream}-condition-${index}">
        <div class="field-condition">
            <label for="${stream}-field-select-${index}">Field:</label><br>
            <select id="${stream}-field-select-${index}" class="field-select">
            </select>
        </div>
        <div class="operator-condition">
            <label for="${stream}-operator-select-${index}">Operator:</label><br>
            <select id="${stream}-operator-select-${index}">
                
            </select>
        </div>
        <div class="value-condition">
            <label for="${stream}-value-select-${index}">Value:</label><br>
            <select id="${stream}-value-select-${index}">
        
            </select>
        </div>
        <input type="button" id="${stream}-remove-condition-${index}" class="condition-mod" value="remove"/><br>
        <input type="button" id="${stream}-and-condition-${index}" class="condition-mod" value="and"/><br>
        <input type="button" id="${stream}-or-condition-${index}" class="condition-mod" value="or"/><br>
    </div> 
    `

}
$('#tg-filter-bar .datepicker').on('apply.daterangepicker', function(ev, picker) {
    window.tgStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.tgEndDate = parseInt(picker.endDate.format('YYYYMMDD'));
    DomainRanking('tg-domains-bar-chart', 'tg');
    AttentionTrends('tg-attention-trends', 'tg');
    TalkingPoints('tg-talking-points', 'tg');

});

$('#mc-filter-bar .datepicker').on('apply.daterangepicker', function(ev, picker) {
    window.mcStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.mcEndDate = parseInt(picker.endDate.format('YYYYMMDD'));
    DomainRanking('mc-domains-bar-chart', 'mc');
    AttentionTrends('mc-attention-trends', 'mc');
    TalkingPoints('mc-talking-points', 'mc');

});
$('#tg-tab').on('show.bs.tab', function (e) {
    $('#tg-filter-bar').show();
    $('#mc-filter-bar').hide();
});
$('#mc-tab').on('show.bs.tab', function (e) {
    $('#mc-filter-bar').show();
    $('#tg-filter-bar').hide();
});
$('#si-tab').on('show.bs.tab', function (e) {
    $('#mc-filter-bar').hide();
    $('#tg-filter-bar').hide();
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
    $(`#${stream}-operator-select-${index}`).html('');
    $(`#${stream}-value-select-${index}`).html('');
    operators.forEach((o) => {
        createOption(`${stream}-operator-select-${index}`, o, o);
    });
    value.forEach((o) => {
        createOption(`${stream}-value-select-${index}`, o, o);
    })
};

function fillForm(elementId){
    fillFields(elementId);
    fillOperatorAndValue(elementId);

}

function addCon(formId){
    let stream = formId.split("-")[0];
    let i = window.conditionCounter[stream];
    let cond = conditionTemplate(i, stream);
    $(`#${formId}`).append(cond);
    fillFields(stream, i);
    fillOperatorAndValue(stream, i);
    window.conditionCounter[stream] += 1;
};


$(document).ready(function (){
    $('#tg-filter-bar').show();
    $('#mc-filter-bar').hide();
    // fillForm('tg-query-form');
    // fillForm('mc-query-form');
    addCon('tg-query-form');
    addCon('mc-query-form');
    initPicker('tg-filter-bar .datepicker', 'tg');
    initPicker('mc-filter-bar .datepicker', 'mc');
    DomainRanking('tg-domains-bar-chart', 'tg');
    AttentionTrends('tg-attention-trends', 'tg');
    TalkingPoints('tg-talking-points', 'tg');
    DomainRanking('mc-domains-bar-chart', 'mc');
    AttentionTrends('mc-attention-trends', 'mc');
    TalkingPoints('mc-talking-points', 'mc');
    MCLocations('mc-locations');
    MCPersons('mc-persons');
    MCOrgs('mc-orgs');
    SSITimeline('si-food-insecurity');

    $('.field-select').on('change', function (e) {
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
        console.log(logic)
        if (logic == 'remove'){
            console.log(stream, index)
            $(`#${stream}-condition-${index}`).remove();
        } else { 
            addCon(`${stream}-query-form`);
            //$(`#${stream}-condition-${window.conditionCounter}`).prepend(`<hr><div>${logic}</div><hr>`);
        }
    });
});