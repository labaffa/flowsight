import { renderBarChartFromUrl } from "./charts/bar-chart-module.js";
import { renderLineChartFromUrl } from "./charts/line-chart-module.js";
import { renderHTMLTableFromUrl } from "./charts/html-table.js";
import { renderHTMLTable } from "./charts/html-table.js";
import { filterStructure } from "./menu-module.js";

window.dateRanges["si"] = [20111227, 20231231];

window.tgStartDate = window.latestUpdates.tg - 7;
window.tgEndDate = window.latestUpdates.tg;
window.mcStartDate = window.latestUpdates.mc - 7;
window.mcEndDate = window.latestUpdates.mc;

window.mcStartDate = 20240101;
window.mcEndDate = 20240108;
window.siStartDate = window.dateRanges.si[1] - 7;
window.siEndDate = window.dateRanges.si[1];

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


async function SSITimeline(containerId){
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let base_endpoint = `/${window.country}/ssi_series`;
    let queryParams = $.param(
        {
            start_date: window.siStartDate,
            end_date: window.siEndDate,
            // here goes domain_id: some int
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: 'Food Insecurity SSI'}
    await renderLineChartFromUrl(
        containerId, url, customOptions, 'date'
    )

};

async function TalkingPoints(containerId, stream){
    $(`#${containerId}`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    let base_endpoint = `/${window.country}/talking_points`;
    let startD, endD;
    startD = stream == "mc" ? window.mcStartDate : window.tgStartDate;
    endD = stream == "mc" ? window.mcEndDate : window.tgEndDate;

    let queryParams = $.param(
        {
            start_date: startD,
            end_date: endD,
            stream: stream
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {titleText: "Talking Points"};
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
            let color = delta >= 0 ? 'green' : 'red'
            latest_value = `<span class="tp-latest">${i.latest_value.toFixed(3)}</span>`;
            prev_value = `<span class="tp-delta" style="color: ${color}">${delta}%</span>`
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
    } else if (stream === 'si') {
        start = window.dateRanges.si[0].toString();
        end = window.dateRanges.si[1].toString();
    }
    start = moment(start)
    end = moment(end)
    let startDate = end.subtract(7, 'date');
    let endDate = end;
    function cb(start, end) {
        $(`#${pickerId} span`).html(start.format('MMMM D, YYYY') + ' - ' + end.format('MMMM D, YYYY'));
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
    // cb(startDate, endDate);
};


function conditionTemplate(index, stream, logicDiv){
    return `<div class="condition" id="${stream}-condition-${index}">
        ${logicDiv}
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
    TgMessageWidget();
});

$('#mc-filter-bar .datepicker').on('apply.daterangepicker', function(ev, picker) {
    window.mcStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.mcEndDate = parseInt(picker.endDate.format('YYYYMMDD'));
    DomainRanking('mc-domains-bar-chart', 'mc');
    AttentionTrends('mc-attention-trends', 'mc');
    TalkingPoints('mc-talking-points', 'mc');
    MCPersons('mc-persons');
    MCLocations('mc-locations');
    MCOrgs('mc-orgs');
    MCStoryWidget();
});
$('#si-filter-bar .datepicker').on('apply.daterangepicker', function(ev, picker) {
    window.siStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.siEndDate = parseInt(picker.endDate.format('YYYYMMDD'));
    SSITimeline('si-food-insecurity')
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
        logicDiv = `<hr><br><div value="${logic}" class="logic" id="${stream}-logic-${i}">  ${logic}  </div><hr><br>`;
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
        
    })
};



$(document).ready(function (){
    $('#tg-filter-bar').show();
    $('#mc-filter-bar').hide();
    $('#si-filter-bar').hide();
    // fillForm('tg-query-form');
    // fillForm('mc-query-form');
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
    SSITimeline('si-food-insecurity');
    TgMessageWidget();
    MCStoryWidget();
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
        if (logic == 'remove'){
            let conditionNumber = $(`#${stream}-query-form .condition`).length;
            if (!(conditionNumber == 1)){

                $(`#${stream}-condition-${index}`).remove();
            } 
            if ($(`#${stream}-query-form .condition`).length == 1){
                $(`#${stream}-query-form .condition .logic`).remove();
            };
        } else { 
            addCon(`${stream}-query-form`, logic);
            
        }
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
            console.log(field, operator, value, logic)
            payload.push(
                {
                    
                    "field": field,
                    "operator": operator,
                    "value": value,
                    "logic": logic
                }
            )
        })
        console.log(payload)
        let base_endpoint = `/${window.country}/filter_attention_trends`;
        let queryParams = $.param(
            {
                start_date: window.tgStartDate,
                end_date: window.tgEndDate,
                conditions: JSON.stringify(payload)
            },
            true
        );
        let url = base_endpoint + '?' + queryParams;
        let customOptions = {};
        await fetch(url).then(
            response => response.json()
        ).then((data) => {
            console.log(data)
        })
        
    });
})