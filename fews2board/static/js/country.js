import { renderBarChartFromUrl } from "./charts/bar-chart-module.js";
import { renderLineChartFromUrl } from "./charts/line-chart-module.js";
import { renderHTMLTableFromUrl } from "./charts/html-table.js";
import { renderHTMLTable } from "./charts/html-table.js";
import { filterStructure } from "./menu-module.js";
import { renderWordCloud } from "./charts/wordcloud-module.js";


window.dateRanges["si"] = [20111227, 20231231];  // check why I hardcoded this daterange
try {
    window.tgStartDate = parseInt(moment(window.dateRanges.tg[1].toString()).subtract(7, 'days').format('YYYYMMDD'));
    window.tgEndDate = window.dateRanges.tg[1];
} catch {
    window.tgStartDate = 19000101;
    window.tgEndDate = 20000101;
}
try {
    window.mcStartDate = parseInt(moment(window.dateRanges.mc[1].toString()).subtract(7, 'days').format('YYYYMMDD'));
    window.mcEndDate = window.dateRanges.mc[1];
} catch {
    window.mcStartDate = 19000101;
    window.mcEndDate = 20000101;
}
try {
    window.mcCalendarMin = moment(window.dateRanges.mc[0].toString());
    window.mcCalendarMax = moment(window.dateRanges.mc[1].toString());
} catch {
    window.mcCalendarMin = moment('19000101');
    window.mcCalendarMax = moment('20000101')
}
try {
    window.tgCalendarMin = moment(window.dateRanges.tg[0].toString());
    window.tgCalendarMax = moment(window.dateRanges.tg[1].toString());
} catch {
    window.tgCalendarMin = moment('19000101');
    window.tgCalendarMax = moment('20000101')
}
try {
    window.siCalendarMin = moment(window.dateRanges.si[0].toString());
    window.siCalendarMax = moment(window.dateRanges.si[1].toString());
} catch {
    window.siCalendarMin = moment('19000101');
    window.siCalendarMax = moment('20000101')
}
// hardcoding because mediacloud entities are less recent than metadata, so default is not empty
// window.mcStartDate = 20240101
// window.mcEndDate = 20240108


window.siStartDate = parseInt(moment(window.dateRanges.si[1].toString()).subtract(365, 'days').format('YYYYMMDD'));
window.siEndDate = window.dateRanges.si[1];

window.conditionCounter = {
    "tg": 0, "mc": 0, "si": 0
};
window.countryConditions = {
    "tg": [], "mc": []
}

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
      search: false,
      disableSelectAll: true,
      showSelectedOptionsFirst: true,
      placeholder: 'Select topic...'
    }
    )
  }
  

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

async function WordCloud(containerId, stream){

    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let startD, endD;
    startD = stream == "mc" ? window.mcStartDate : window.tgStartDate;
    endD = stream == "mc" ? window.mcEndDate : window.tgEndDate;

    let base_endpoint = `/${window.country}/tfidf_top_terms`;
    let queryParams = $.param(
        {
            start_date: startD,
            end_date: endD,
            stream: stream,
            limit: 50
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {
        titleText: 'Significant Terms',
        chartHeightRatio: null,
        chartWidth: null
    }
    let mappingKeys = {'categoryKey': 'lemma', 'valueKey': 'mean_value'};
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
        startDate = moment(window.tgStartDate.toString());
        endDate = moment(window.tgEndDate.toString());
    } else if (stream === 'mc') {
        start = window.mcCalendarMin;
        end = window.mcCalendarMax;
        startDate = moment(window.mcStartDate.toString());
        endDate = moment(window.mcEndDate.toString());
    } else if (stream === 'si') {
        start = window.siCalendarMin;
        end = window.siCalendarMax;
        startDate = moment(window.siStartDate.toString());
        endDate = moment(window.siEndDate.toString());
    }
    
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
    TgMessageWidget();
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
    WordCloud('tg-top-terms', 'tg');
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

function TgMessageCard(author, url, body, timestamp){
    return `
    <div class='mc-card mt-4 mb-4'>
        <div class="mc-message mb-4 mt-2">
            <div class="mb-2"><span>${body}</span>
       
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

function MCStoryCard(author, storyUrl, body, timestamp){
    return `
    <div class='mc-card mt-4 mb-4'>
        <div class="mc-message mb-4 mt-2">
            <a href="${storyUrl}" style="color: white;" class="link" target="_blank" rel="noopener noreferrer">${body}</a>
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

async function MCStoryWidget(){
    let MAX_LEN = 300;
    $(`#mc-stories`).html('<div class="h-100 d-flex justify-content-center align-items-center"><div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div></div>');

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
        if (data.length == 0) {
            $(`#mc-stories`).html(noDataHTML);
        } else {
            $(`#mc-stories`).html('');
            $('#mc-stories').append(
                `<div class="widget-title">News Stories</div>
                <br>
                <br>
                <div class="table-container">
                    <div class="" id="mc-stories-content">
                    </div>
                </div>
                `
            )
            data.forEach(function(d) {
                let author_username = d.username ? d.username : '';
                let body = d.body ? d.body : '';
                let url = d.url ? d.url : '';
                
                $('#mc-stories-content').append(
                    MCStoryCard(author_username, url, truncate(body, MAX_LEN), d.timestamp)

                )
                $('#mc-stories-content').append(
                    '<div class="cards-separator"></div>'
                )
            
            });
            reflowCharts();
        }
    })    

};


async function TgMessageWidget(){
    let MAX_LEN = 300;
    $(`#tg-messages`).html('<div class="h-100 d-flex justify-content-center align-items-center"><div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div></div>');
    

    let base_endpoint = `/${window.country}/tg_messages`;
    let queryParams = $.param(
        {
            start_date: window.tgStartDate,
            end_date: window.tgEndDate,
            conditions: JSON.stringify(window.countryConditions["tg"]),
            entity: 'location',
            sorted_by: 'date',
            limit: 30
        },
        true
    );
    
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {};
    await fetch(url).then(
        response => response.json()
    ).then(data => {
        if (data.length == 0) {
            $(`#tg-messages`).html(noDataHTML);
        } else {
            $(`#tg-messages`).html('');
            $('#tg-messages').append(
                `<div class="widget-title">Conversations</div>
                <br>
                <br>
                <div class="table-container">
                    <div class="" id="tg-messages-content">
                    </div>
                </div>
                `
            )
            data.forEach(function(d) {
                let author_username = d.username ? d.username : '';
                let body = d.body ? d.body : '';
                let url = author_username + '/' + d.message_id.toString();
                $('#tg-messages-content').append(
                    TgMessageCard(author_username, url, truncate(body, MAX_LEN), d.timestamp)
                );
                $('#tg-messages-content').append(
                    '<div class="cards-separator"></div>'
                );
            
            });
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
        WordCloud('tg-top-terms', 'tg');
        TgMessageWidget();
        
        MCStoryWidget();
        DomainRanking('mc-domains-bar-chart', 'mc');
        AttentionTrends('mc-attention-trends', 'mc');
        TalkingPoints('mc-talking-points', 'mc');
        MCLocations('mc-locations');
        MCPersons('mc-persons');
        MCOrgs('mc-orgs');
        SSITimeline('si-food-insecurity', 3);
        SSIFieldsTimeline('si-food-insecurity-fields', 3);
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

        $(`#${stream}-talking-points`).html('<div class="h-100 d-flex justify-content-center align-items-center"><div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div></div>');        
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