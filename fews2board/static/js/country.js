import { renderBarChartFromUrl } from "./charts/bar-chart-module.js";
import { renderLineChartFromUrl } from "./charts/line-chart-module.js";
import { renderHTMLTableFromUrl } from "./charts/html-table.js";
import { renderHTMLTable } from "./charts/html-table.js";
import { filterStructure } from "./menu-module.js";

window.dateRanges["si"] = [20111227, 20231231];

window.tgStartDate = parseInt(moment(window.latestUpdates.tg.toString()).subtract(7, 'days').format('YYYYMMDD'));
window.tgEndDate = window.latestUpdates.tg;
window.mcStartDate = parseInt(moment(window.latestUpdates.mc.toString()).subtract(7, 'days').format('YYYYMMDD'));
window.mcEndDate = window.latestUpdates.mc;

window.mcStartDate = 20240101;
window.mcEndDate = 20240108;

window.siStartDate = parseInt(moment(window.dateRanges.si[1].toString()).subtract(365, 'days').format('YYYYMMDD'));
window.siEndDate = window.dateRanges.si[1];

window.conditionCounter = {
    "tg": 0, "mc": 0, "si": 0
};
window.countryConditions = {
    "tg": [], "mc": []
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

function reflowCharts(){
    $('.hcs').each(function (){
        let chart = jQuery(this).highcharts();
            if (chart){
                chart.reflow();
            }
})};

async function DomainRanking(containerId, stream) {
    let hashContainerId = '#' + containerId;
    $(hashContainerId).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let startD, endD; 
    endD = stream == "mc" ? window.mcEndDate : window.tgEndDate;
    startD = stream == "mc" ? window.mcStartDate : window.tgStartDate;

    let base_endpoint = `/${window.country}/domain_ranking`;
    let queryParams = $.param(
        {
            start_date: startD,
            end_date: endD,
            stream: stream
        },
        true
    ); 
    let mappingKeys = {'categoryKey': 'domain', 'valueKey': 'frequency'};
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: 'Hot Topics'};

    await renderBarChartFromUrl(
        containerId, url, mappingKeys, customOptions);
};

async function AttentionTrends(containerId, stream) {
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let startD, endD;
    startD = stream == "mc" ? window.mcStartDate : window.tgStartDate;
    endD = stream == "mc" ? window.mcEndDate : window.tgEndDate;

    let base_endpoint = `/${window.country}/attention_trends`;
    let queryParams = $.param(
        {
            start_date: startD,
            end_date: endD,
            stream: stream
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: 'Attention'}
    await renderLineChartFromUrl(
        containerId, url, customOptions, 'date'
    )
};


async function SSITimeline(containerId, domainId){
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let base_endpoint = `/${window.country}/ssi_series`;
    let queryParams = $.param(
        {
            start_date: window.siStartDate,
            end_date: window.siEndDate,
            domain_id: domainId
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: 'Food Insecurity SSI'}
    await renderLineChartFromUrl(
        containerId, url, customOptions, 'date'
    )

};

async function SSIFieldsTimeline(containerId, domainId){
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let base_endpoint = `/${window.country}/ssi_fields_series`;
    let queryParams = $.param(
        {
            start_date: window.siStartDate,
            end_date: window.siEndDate,
            domain_id: domainId
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: 'Food Insecurity SSI by topic'}
    await renderLineChartFromUrl(
        containerId, url, customOptions, 'date'
    )

};


async function TalkingPoints(containerId, stream, endP='/talking_points', conditions=""){
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let base_endpoint = `/${window.country}${endP}`;
    let startD, endD;
    startD = stream == "mc" ? window.mcStartDate : window.tgStartDate;
    endD = stream == "mc" ? window.mcEndDate : window.tgEndDate;
    
    let queryParams = $.param(
        {
            start_date: startD,
            end_date: endD,
            stream: stream,
            conditions: conditions
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: "Talking Points"};
    await fetch(url).then(
        response => response.json()
    ).then(data => {
        
        let dataCopy = [...data]
        var r = {};
        
        dataCopy.forEach(function(i) {
            
            var layer = i.layer;
            let latest_value, prev_value, delta, percentSign;

            if (!r[i.domain]) {
                r[i.domain] = {};
            }
            if (layer === "attention"){
                i.latest_value = i.latest_value;
                i.prev_value = i.prev_value ? i.prev_value: i.prev_value;
                delta = ((i.latest_value - i.prev_value)/i.prev_value)*100
                percentSign = ' %'
            } else {
                
                delta = i.latest_value - i.prev_value;
                percentSign = '';
            }
            
            console.log(stream, i.latest_value, i.prev_value, delta)
            i.prev_value = (i.prev_value) ? i.prev_value : '';
            let color = delta >= 0 ? 'green' : 'red'
            latest_value = `<span class="tp-latest">${i.latest_value.toFixed(3)}</span>`;
            prev_value = `<span class="tp-delta" style="color: ${color}">${delta.toFixed(1)}${percentSign}</span>`
            r[i.domain][layer] = `${latest_value} -- ${prev_value}`;
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
        reflowCharts();
        
    })

};

async function MCPersons(tableId) {
    $(`#${tableId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
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

        var out = [];
        
        data.forEach(function(d) {
            
            let entity = `<span class="mc-entity">${d.person}</span>`;
            let coverage = `<span class="mc-entity-coverage">${(d.value*100).toFixed(2)}%</span>`
            out.push({"Person": entity, "Coverage": coverage})
        });
        renderHTMLTable(tableId, out, customOptions);
        reflowCharts();
    })
};

async function MCLocations(tableId) {
    $(`#mc-locations`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');

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

        var out = [];
        
        data.forEach(function(d) {
            
            let entity = `<span class="mc-entity">${d.location}</span>`;
            let coverage = `<span class="mc-entity-coverage">${(d.value*100).toFixed(2)}%</span>`
            out.push({"Location": entity, "Coverage": coverage})
        });
        renderHTMLTable(tableId, out, customOptions);
        reflowCharts();
    })


};

async function MCOrgs(tableId) {
    $(`#mc-orgs`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');

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

        var out = [];
        
        data.forEach(function(d) {
            
            let entity = `<span class="mc-entity">${d.org}</span>`;
            let coverage = `<span class="mc-entity-coverage">${(d.value*100).toFixed(2)}%</span>`
            out.push({"Org": entity, "Coverage": coverage})
        });
        renderHTMLTable(tableId, out, customOptions);
        reflowCharts();
    })

};


function initPicker(pickerId, stream) {
    let start, end, startDate, endDate;
    if (stream === 'tg'){
        start = moment(window.dateRanges.tg[0].toString());
        end = moment(window.dateRanges.tg[1].toString());
        startDate = moment(window.tgStartDate.toString());
        endDate = moment(window.tgEndDate.toString());
    } else if (stream === 'mc') {
        start = moment(window.dateRanges.mc[0].toString());
        end = moment(window.dateRanges.mc[1].toString());
        startDate = moment(window.mcStartDate.toString());
        endDate = moment(window.mcEndDate.toString());
    } else if (stream === 'si') {
        start = moment(window.dateRanges.si[0].toString());
        end = moment(window.dateRanges.si[1].toString());
        startDate = moment(window.siStartDate.toString());
        endDate = moment(window.siEndDate.toString());
    }
    
    console.log(start, end, startDate, endDate)
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
    cb(startDate, endDate);
};


function conditionTemplate(index, stream, logicDiv){
    return `<div class="condition" id="${stream}-condition-${index}">
        ${logicDiv}
        <div class="d-flex flex-wrap justify-content-center align-items-center">
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
            <div class="value-condition sub-condition">
                <label for="${stream}-value-select-${index}">Value:</label><br>
                <select id="${stream}-value-select-${index}">
                
                </select>
            </div>
            <div  id="${stream}-remove-condition-${index}" class="condition-mod icon" value="Remove"> 
                <img src="/static/img/trash-bin.svg"  alt="">
            </div> 
            <div  id="${stream}-and-condition-${index}" class="condition-mod icon add-filter" value="And">
                <img src="/static/img/plus-sign.svg"  alt="">
            </div>
            
        </div>
    </div> 
    `

}
$('#tg-filter-bar .datepicker').on('apply.daterangepicker', function(ev, picker) {
    window.tgStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.tgEndDate = parseInt(picker.endDate.format('YYYYMMDD'));

    let start_date = window.tgStartDate;
    let end_date = window.tgEndDate;
    let stream = 'tg';
    let base_endpoint = `/${window.country}/filter_attention_trends`;
    let queryParams = $.param(
        {
            start_date: start_date,
            end_date: end_date,
            conditions: JSON.stringify(window.countryConditions[stream]),
            stream: stream
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: 'Attention'}
    $(`#${stream}-attention-trends`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    renderLineChartFromUrl(
        `${stream}-attention-trends`, url, customOptions, 'date'
    )

    let hotTopicsEndpoint = `/${window.country}/domain_ranking`;
    let hotUrl = hotTopicsEndpoint + '?' + queryParams;
    customOptions = {titleText: 'Hot Topics'};
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
    TgMessageWidget();
    fillSearchBar(stream);

    
});

$('#mc-filter-bar .datepicker').on('apply.daterangepicker', function(ev, picker) {
    window.mcStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.mcEndDate = parseInt(picker.endDate.format('YYYYMMDD'));
    let start_date = window.mcStartDate;
    let end_date = window.mcEndDate;
    let stream = 'mc';
    let base_endpoint = `/${window.country}/filter_attention_trends`;
    let queryParams = $.param(
        {
            start_date: start_date,
            end_date: end_date,
            conditions: JSON.stringify(window.countryConditions[stream]),
            stream: stream
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: 'Attention'}
    $(`#${stream}-attention-trends`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    renderLineChartFromUrl(
        `${stream}-attention-trends`, url, customOptions, 'date'
    )

    let hotTopicsEndpoint = `/${window.country}/domain_ranking`;
    let hotUrl = hotTopicsEndpoint + '?' + queryParams;
    customOptions = {titleText: 'Hot Topics'};
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
    fillSearchBar(stream);
    
    MCPersons('mc-persons');
    MCLocations('mc-locations');
    MCOrgs('mc-orgs');
    MCStoryWidget();
});
$('#si-filter-bar .datepicker').on('apply.daterangepicker', function(ev, picker) {
    window.siStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.siEndDate = parseInt(picker.endDate.format('YYYYMMDD'));
    SSITimeline('si-food-insecurity', 3);
    SSIFieldsTimeline('si-food-insecurity-fields', 3);
});



$('#tg-tab').on('show.bs.tab', function (e) {
    $('#tg-filter-bar').show();
    $('#mc-filter-bar').hide();
    $('#si-filter-bar').hide();
});
$('#mc-tab').on('show.bs.tab', function (e) {
    $('#mc-filter-bar').show();
    $('#tg-filter-bar').hide();
    $('#si-filter-bar').hide();
});
$('#si-tab').on('show.bs.tab', function (e) {
    $('#si-filter-bar').show();
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

function TgMessageCard(author, body, timestamp){
    return `
    <div class='tg-card'>
        <div class="tg-author">${author}</div>
        <br>
        <div class="tg-message">${body}</div>
        <br>
        <div class="tg-timestamp">${timestamp}</div>
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

function MCStoryCard(author, storyUrl, body, timestamp){
    return `
    <div class='mc-card'>
        <div class="mc-author">
            <a href="${storyUrl}" class="link" target="_blank" rel="noopener noreferrer">${author}</a>
        </div>
        <br>
        <div class="mc-message">${body}</div>
        <br>
        <div class="mc-timestamp">${timestamp}</div>
        
    </div>
    `


}

async function MCStoryWidget(){
    let MAX_LEN = 300;
    $(`#mc-stories`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');

    let base_endpoint = `/${window.country}/mc_stories`;
    let queryParams = $.param(
        {
            start_date: window.mcStartDate,
            end_date: window.mcEndDate,
            conditions: JSON.stringify(window.countryConditions["mc"]),
            sorted_by: 'date',
            limit: 10
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {};
    await fetch(url).then(
        response => response.json()
    ).then(data => {

        $(`#mc-stories`).html('');
        $('#mc-stories').append(
            `<div class="widget-title">News Stories</div>
            <br>
            <br>
            `
        )
        data.forEach(function(d) {
            let author_username = d.username ? d.username : '';
            let body = d.body ? d.body : '';
            let url = d.url ? d.url : '';
            
            $('#mc-stories').append(
                MCStoryCard(author_username, url, truncate(body, MAX_LEN), d.timestamp)

            )
            $('#mc-stories').append(
                '<div class="cards-separator"></div>'
            )
           
        });
        reflowCharts();
    })    

};


async function TgMessageWidget(){
    let MAX_LEN = 300;
    $(`#tg-messages`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');

    let base_endpoint = `/${window.country}/tg_messages`;
    let queryParams = $.param(
        {
            start_date: window.tgStartDate,
            end_date: window.tgEndDate,
            conditions: JSON.stringify(window.countryConditions["tg"]),
            entity: 'location',
            sorted_by: 'date',
            limit: 10
        },
        true
    );
    
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {};
    await fetch(url).then(
        response => response.json()
    ).then(data => {

        $(`#tg-messages`).html('');
        $('#tg-messages').append(
            `<div class="widget-title">Conversations</div>
            <br>
            <br>
            `
        )
        data.forEach(function(d) {
            let author_username = d.author_username ? d.author_username : '';
            let body = d.body ? d.body : '';
            
            $('#tg-messages').append(
                TgMessageCard(author_username, truncate(body, MAX_LEN), d.timestamp)
            );
            $('#tg-messages').append(
                '<div class="cards-separator"></div>'
            );
           
        });
        reflowCharts();
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


$(document).ready(async function (){
    $('#tg-filter-bar').show();
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
        DomainRanking('tg-domains-bar-chart', 'tg');
        AttentionTrends('tg-attention-trends', 'tg');
        TalkingPoints('tg-talking-points', 'tg');
        DomainRanking('mc-domains-bar-chart', 'mc');
        
        AttentionTrends('mc-attention-trends', 'mc');
        TalkingPoints('mc-talking-points', 'mc');
        MCLocations('mc-locations');
        MCPersons('mc-persons');
        MCOrgs('mc-orgs');
        SSITimeline('si-food-insecurity', 3);
        SSIFieldsTimeline('si-food-insecurity-fields', 3);
        TgMessageWidget();
        MCStoryWidget();
    };


     function renderNonChartCards(){
        TalkingPoints('tg-talking-points', 'tg');
        TalkingPoints('tg-talking-points', 'tg');
        MCLocations('mc-locations');
        MCPersons('mc-persons');
        MCOrgs('mc-orgs');
        TgMessageWidget();
        MCStoryWidget();

        reflowCharts();
    };
    async function renderElements(){
        addCon('tg-query-form');
        addCon('mc-query-form');
        initPicker('tg-filter-bar .datepicker', 'tg');
        initPicker('mc-filter-bar .datepicker', 'mc');
        initPicker('si-filter-bar .datepicker', 'si')
        DomainRanking('tg-domains-bar-chart', 'tg');
        AttentionTrends('tg-attention-trends', 'tg');
        TalkingPoints('tg-talking-points', 'tg');
        DomainRanking('mc-domains-bar-chart', 'mc');
        
        AttentionTrends('mc-attention-trends', 'mc');
        TalkingPoints('mc-talking-points', 'mc');
        MCLocations('mc-locations');
        MCPersons('mc-persons');
        MCOrgs('mc-orgs');
        SSITimeline('si-food-insecurity', 3);
        SSIFieldsTimeline('si-food-insecurity-fields', 3);
        TgMessageWidget();
        MCStoryWidget();
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
            let value = $($(this).find('.value-condition select')[0]).val();
            if (field == "Topic") {
                value = window.topicsByName[value]
            };
            let logic = $(this).find('.logic');
            logic = logic.length > 0 ? $(logic).attr('value') : "";
            payload.push(
                {
                    
                    "field": field,
                    "operator": operator,
                    "value": value,
                    "logic": logic
                }
            )
        })
        window.countryConditions[stream] = payload
        let base_endpoint = `/${window.country}/filter_attention_trends`;
        let queryParams = $.param(
            {
                start_date: start_date,
                end_date: end_date,
                conditions: JSON.stringify(window.countryConditions[stream]),
                stream: stream
            },
            true
        );
        let url = base_endpoint + '?' + queryParams;
        let customOptions = {titleText: 'Attention'}
        $(`#${stream}-attention-trends`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
        renderLineChartFromUrl(
            `${stream}-attention-trends`, url, customOptions, 'date'
        )

        let hotTopicsEndpoint = `/${window.country}/domain_ranking`;
        let hotUrl = hotTopicsEndpoint + '?' + queryParams;
        customOptions = {titleText: 'Hot Topics'};
        let hasTopic = window.countryConditions[stream].some(obj => obj.field === 'Topic');
        let categoryKey = hasTopic ? 'topic' : 'domain';
        let mappingKeys = {'categoryKey': categoryKey, 'valueKey': 'frequency'};
        $(`#${stream}-domains-bar-chart`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
        renderBarChartFromUrl(
            `${stream}-domains-bar-chart`, hotUrl, mappingKeys, customOptions);

        
        // let talkingPointsEndpoint = `/${window.country}/talking_points_on_conditions`;
        // let talkingUrl = talkingPointsEndpoint + '?' + queryParams;
        //     await fetch(talkingUrl).then((response) => response.json()).then(data => {console.log(data)})

        $(`#${stream}-talking-points`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');        
        TalkingPoints(
            `${stream}-talking-points`, stream, 
            '/talking_points_on_conditions', JSON.stringify(window.countryConditions[stream]))
        TgMessageWidget();
        MCStoryWidget();
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
    renderElements();
})