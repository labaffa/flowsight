import { renderBarChartFromUrl } from "./charts/bar-chart-module.js";
import { renderLineChartFromUrl } from "./charts/line-chart-module.js";
import { renderHTMLTableFromUrl } from "./charts/html-table.js";
import { renderHTMLTable } from "./charts/html-table.js";

window.tgStartDate = window.latestUpdates.tg - 7;
window.tgEndDate = window.latestUpdates.tg;
window.mcStartDate = window.latestUpdates.mc - 7;
window.mcEndDate = window.latestUpdates.mc;

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


$('#tg-filter-bar').on('apply.daterangepicker', function(ev, picker) {
    window.tgStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.tgEndDate = parseInt(picker.endDate.format('YYYYMMDD'));
    DomainRanking('tg-domains-bar-chart', 'tg');
    AttentionTrends('tg-attention-trends', 'tg');
    TalkingPoints('tg-talking-points', 'tg');

});

$('#mc-filter-bar').on('apply.daterangepicker', function(ev, picker) {
    window.mcStartDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.mcEndDate = parseInt(picker.endDate.format('YYYYMMDD'));
    DomainRanking('mc-domains-bar-chart', 'mc');
    AttentionTrends('mc-attention-trends', 'mc');
    TalkingPoints('mc-talking-points', 'mc');

});
$('#tg-tab').on('show.bs.tab', function (e) {
    $('#tg-filter-bar').show();
    $('mc-filter-bar').hide();
});
$('#mc-tab').on('show.bs.tab', function (e) {
    $('#mc-filter-bar').show();
    $('tg-filter-bar').hide();
});
$('#si-tab').on('show.bs.tab', function (e) {
    $('#mc-filter-bar').hide();
    $('tg-filter-bar').hide();
});

$(document).ready(function (){
    $('#tg-filter-bar').show();
    $('#mc-filter-bar').hide();
    initPicker('tg-filter-bar', 'tg');
    initPicker('mc-filter-bar', 'mc');
    DomainRanking('tg-domains-bar-chart', 'tg');
    AttentionTrends('tg-attention-trends', 'tg');
    TalkingPoints('tg-talking-points', 'tg');
    DomainRanking('mc-domains-bar-chart', 'mc');
    AttentionTrends('mc-attention-trends', 'mc');
    TalkingPoints('mc-talking-points', 'mc');
});