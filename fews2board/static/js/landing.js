import { renderMap } from "./charts/map-module.js";
import { showInfoPopup, hideInfoPopup } from "./utils.js";

const layerDescriptions = {
    "attention": `
        <div class='info-box-content'>
            <div class="info-box-section">
                <p>
                    <strong>
                        Based on the custom taxonomy developed for topics of interest to FEWS NET, 
                        the map displays the aggregated Attention of selected domains, 
                        for the selected data streams, for the latest week’s data, by country.
                    </strong>
                <p>
            </div>
            
            <div class="info-box-section">
                <p>
                    The attention metric for each domain is calculated from the aggregated presence of 
                    terms associated to particular topics in a data stream, normalized on the value of 
                    the total word count and scaled on a range from 0 to 1. 
                </p>
            </div>

            <div class="info-box-section">
                <p>
                    Default displays the sum of averages for both data streams for the latest week’s data. 
                    If filtering for data stream, the map displays the average attention score only for 
                    countries where the domain was detected in that data stream within the period. 
                    Scale: 0 to 1. 
                </p>
            </div>
        </div>
    `,
    "sentiment": `
        <div class='info-box-content'>

            <div class="info-box-section">
                <p>
                    <strong>
                        Average sentiment score for the selected domain, 
                        for the selected data streams, for the latest week’s data, by country.
                    </strong>
                <p>
            </div>
            
            <div class="info-box-section">
                <p>
                If filtering for data stream, the map displays the average sentiment score only 
                for countries where the domain was detected in that data stream within the period. 
                    Scale: -1 to 1.
                </p>
            </div>
        </div>

    `,
    "anomaly": `
        <div class='info-box-content'>

            <div class="info-box-section">
                <p>
                    <strong>
                        This metric identifies any anomalies in the topic prevalence, 
                        i.e. topics that are presenting a different attention than usual, per country.   
                    </strong>
                <p>
            </div>
            
            <div class="info-box-section">
                <p>
                They are presented as the count of anomalous topics for the selected domain and data stream during 
                the last week. 
                When both data streams are selected, the count is an average between telegram and mediacloud. 
                </p>
            </div>

            <div class="info-box-section">
                <p>
                For every topic, the average and standard deviation of the daily normalized prevalences 
                are calculated considering the whole dataset; a topic is then tagged as anomalous on a 
                specific date when 
                its topic normalized prevalence is larger than the average + standard deviation.
                </p>
            </div>
        </div>
    `,

}

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
            return {'hc-key': key, 'value': countries[key]['value'], 'topic_names': countries[key]['topic_names']};
        });
        await $("#sentiment-map").highcharts().series[0].update({
            data: mapInp
        });
        $("#sentiment-map").highcharts().legend.update({title: {text: `${LayersMap[window.selectedLayer].text} from ${window.dateRange[0]} to ${window.dateRange[1]}`}})
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
    $('#info-acc-collapse .accordion-body').html(layerDescriptions[window.selectedLayer]);
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
    document.querySelectorAll('.popup-trigger').forEach((s) => s.addEventListener('mouseenter', showInfoPopup) )
    document.querySelectorAll('.popup-trigger').forEach((s) => s.addEventListener('mouseleave', hideInfoPopup) )
    window.selectedDomain = 1;
    window.selectedStreams = ["tg", "mc"];
    window.streamKey = "all";
    window.selectedAnalysis = ["anomaly"];
    window.selectedLayer = "anomaly";
    $('#info-acc-collapse .accordion-body').html(layerDescriptions[window.selectedLayer]);
    $('#ham-filter .filter-icon').on('click', function (){
        $('#ham-filter .filter-body').toggle();
    })
    // let mapInp = prepareMapInput()
    let countries = window.mapInput[window.selectedDomain][
        window.selectedLayer][window.streamKey]
    let mapInp =  Object.keys(countries).map(key => {
        return {'hc-key': key, 'value': countries[key]['value'], 'topic_names': countries[key]['topic_names']};
    });
    showAccordionItem($(`[domain_id=${selectedDomain}]`).first().attr('id'));
     renderMap(
        'sentiment-map', mapInp, 
        mapCustomOptions,
        mapTopology)
});