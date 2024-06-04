import { renderMap } from "./charts/map-module.js";


Highcharts.setOptions({
	// Set options for the chart backgrounds.
	chart: {
		styledMode: true,
		height: '100%',
	},
	// Erases Highcharts watermark.
	credits: {
		text: '',
	},
	// Set options for export module.
	exporting: {
		buttons: {
			contextButton: {
				menuItems: ["viewFullscreen", "separator", "downloadPNG", "downloadJPEG", "downloadPDF", "downloadSVG", "downloadCSV", "downloadXLS"],
			},
		},
	},
	// Set options for the x-axis.
	xAxis: {
		title: {
			margin: 8,
		},
		labels: {
			rotation: -40,
		},
	},
	// Set options for the y-axis.
	yAxis: {
		title: {
			margin: 8,
		},
		alternateGridColor: true,
	},
});


async function loadMap() {
    try {
        const topology = await fetch('static/js/charts/custom-map-topology.json')
        .then(response => response.json());
        return topology;
    } catch (error) {
        throw new Error('Error loading map');
    }
}


const mapTopology = await loadMap();
var filterData = mapData;
const mapCustomOptions = {}


filterData = filterData.filter(obj => obj.analysis === "sentiment" && obj.domain_id === 1);

var averageValues = filterData.reduce((accumulator, currentValue) => {
    const key = currentValue.alpha_2;
    
    if (!accumulator[key]) {
        accumulator[key] = { sum: 0, count: 0 };
    }
    
    accumulator[key].sum += currentValue.value;
    accumulator[key].count++;
    
    return accumulator;
}, {});

// Calcola la media per ogni combinazione di "country_id" e "domain_id"
for (const key in averageValues) {
    averageValues[key] = averageValues[key].sum / averageValues[key].count;
}

let avg_keys = Object.keys(averageValues);

// Utilizza il metodo map per trasformare ciascuna chiave nell'array di oggetti
window.sentimentConflictData = avg_keys.map(key => {
    return {'hc-key': key, 'value': averageValues[key]}; // Crea un nuovo oggetto con le chiavi 'hc-key' e 'value'
});

function prepareMapInput(
    data=window.mapData, 
    domain=window.selectedDomain,
    streams=window.selectedStreams, 
    analysis=window.selectedAnalysis
) {
    let oos = {};

    for (const item of data) {
        if (item["domain_id"] === domain && 
            streams.includes(item["data_stream"]) && 
            analysis.includes(item["analysis"])) {
            if (!oos[item["alpha_2"]]) {
                oos[item["alpha_2"]] = {
                    values: [],
                    average: 0
                };
            }
            oos[item["alpha_2"]].values.push(item["value"]);
            const sum = oos[item["alpha_2"]].values.reduce((acc, curr) => acc + curr, 0);
            oos[item["alpha_2"]].average = sum / oos[item["alpha_2"]].values.length;
        }
    }
    let out = Object.keys(oos).map(key => {
        return {'hc-key': key, 'value': oos[key].average};
    });
    return out
};

async function updateMap() {
    let mapInp = {};
    if (window.selectedStreams.length > 0){
        window.streamKey = window.selectedStreams.length > 1 ? "all": window.selectedStreams[0]
        let countries = window.mapInput[window.selectedDomain][
            window.selectedLayer][window.streamKey]
        mapInp =  Object.keys(countries).map(key => {
            return {'hc-key': key, 'value': countries[key]};
        });
        await $("#sentiment-map").highcharts().series[0].update({
            data: mapInp
        });
    } else {
        window.streamKey = "";
        mapInp = {};
        await $("#sentiment-map").highcharts().series[0].setData([]);
    }
    
};


function tooltipSpinner(){
	return `<div  
	class="spinner-border  fews-country" 
	role="status"
    style="height: 1rem; width: 1rem;"
    >
	</div>
    `;
};


function tooltipCallBackTemplate(){
	return `<div 
    class="p-3"
    style="background-color: #f7f7f7"
    >
	<div class="row" id="tt-header">
	<h2>${this.point.name}</h2>
    <div class="d-flex flex-fill justify-content-center">
    ${tooltipSpinner()}
    </div>
	</div>
	<div class="row mt-3" style="margin: 0">
		<p class="h6 border-bottom" style="padding: 0">Trending Topics</p>
	</div>
	<div class="d-flex flex-fill justify-content-center" id="tt-trending-topics">${tooltipSpinner()}</div>
    <div class="row mt-3" style="margin: 0">
		<p class="h6 border-bottom" style="padding: 0">Trending Terms</p>
	</div>
	<div class="d-flex flex-fill justify-content-center" id="tt-trending-topics">${tooltipSpinner()}</div>
	<div class="row mt-3" style="margin: 0">
		<p class="h6 border-bottom" style="padding: 0">Last Sentiment</p>
	</div>
	<div class="d-flex flex-fill justify-content-center" id="tt-last_sentiment">${tooltipSpinner()}</div>
	<div class="row mt-3" style="margin: 0">
		<p class="h6 border-bottom" style="padding: 0">Last Document Comparison</p>
	</div>
	<div class="d-flex flex-fill justify-content-center" id="tt-last-dc">${tooltipSpinner()}</div>
</div>
	`;
};

function tooltipCallBack(){
    let toptopics, latest_sentiment;
    if (window.streamKey == 'tg'){
        toptopics = window.mapTooltipData[this.point['hc-key']]['tg']['top_topics'];
        latest_sentiment = window.mapTooltipData[this.point['hc-key']]['tg']['sentiment']
    } else if (window.streamKey == 'mc') {
        toptopics = window.mapTooltipData[this.point['hc-key']]['mc']['top_topics'];
        latest_sentiment = window.mapTooltipData[this.point['hc-key']]['mc']['sentiment'];
    } else if (window.streamKey == 'all') {

    }
    
    html = `<div class="p-3" style="background-color: #f7f7f7">
	<div class="row">
		<h2>${this.point.name}</h2>
		
	</div>
	<div class="row mt-3" style="margin: 0">
		<p class="h6 border-bottom" style="padding: 0">Trending Topics</p>
	</div>
	<div class="row">
		<div class="col">`
        for (let i=0; i < toptopics.length; i++){
            html += `<span class="badge rounded-pill badge-theme-${i}">${topics[i]}</span>`
        }
    html += 
    `
		</div>
	</div>

	<div class="row mt-3" style="margin: 0">
		<p class="h6 border-bottom" style="padding: 0">Last Sentiment</p>
	</div>
	<div class="row">
		<div class="col">
			<span style="font-weight: 600;">
			${parseTooltipValue(sentiment.sentiment)}
			</span>&nbsp;&nbsp;
			${getTooltipChangeHTML(sentiment.delta)}
		</div>
	</div>
</div>
	`;
    return html
};

$('#domainsAcc').on('shown.bs.collapse', async function (event) { 

    // event.target is the collapsed element
    let domainId = $(event.target).attr('domain_id');
    window.selectedDomain = parseInt(domainId);
    $('.accordion-button').removeClass('clicked');
    // Aggiungi l'attributo 'clicked' solo al bottone che è stato cliccato
    $(event.target).closest('.accordion-item').find('.accordion-button').addClass('clicked');
    await updateMap();
});
$('.stream').on('change', async function(event){
    let activeStreams = $(".stream:checked").map(function() {
        return $(this).attr("data-stream");
    }).get();
    window.selectedStreams = activeStreams;
    updateMap();
}
)
$('.a-layer').on('change', function(event){
    
    let selLayer = $(".a-layer:checked").map(function() {
        return $(this).attr("layer");
    }).get();
    window.selectedLayer = selLayer[0];
    updateMap();
});
function showAccordionItem(itemId) {
    // Hide all collapse elements
    $('.collapse').collapse('hide');
    // Show the specified collapse element
    $(`#${itemId}`).collapse('show');
    $(`#${itemId}`).closest('.accordion-item').find('.accordion-button').addClass('clicked');
  }
$(document).ready(async function(){
    window.selectedDomain = 1;
    window.selectedStreams = ["tg", "mc"];
    window.streamKey = "all";
    window.selectedAnalysis = ["sentiment"];
    window.selectedLayer = "sentiment";
    $('#ham-filter .filter-icon').on('click', function (){
        $('#ham-filter .filter-body').toggle();
    })
    // let mapInp = prepareMapInput()
    let countries = window.mapInput[window.selectedDomain][
        window.selectedLayer][window.streamKey]
    let mapInp =  Object.keys(countries).map(key => {
        return {'hc-key': key, 'value': countries[key]};
    });
    showAccordionItem($(`[domain_id=${selectedDomain}]`).first().attr('id'));
     renderMap(
        'sentiment-map', mapInp, 
        mapCustomOptions,
        mapTopology)
});