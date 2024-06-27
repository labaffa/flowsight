function parseTooltipValue(v, d=false){
	// d is a flag to separate 'from previous report' (d=true) from main value
	let vf = parseFloat(v);
	let out = vf ? vf.toFixed(2) : vf;
	if (d){
		if (!isNaN(out)){
			out = (vf >=0) ? '+' + out : out;
			out = out + ' from previous update'
		}
		else {out = ""}
	}
	return out;
};

function getTooltipChangeHTML (v) {
	let vf = parseFloat(v);
	var color = null;

	// Determine color to add based on the value
	if ( vf < 0 ) {
		color = "#6D4140";
		
	} else if ( vf > 0) {
		color = "#689F38";
	}

	//If a color is defined add styling
	if ( color ) {
		return (`<span style="color: ${color}">
			${parseTooltipValue(v, true)}
			</span>`);
	} else {
		return (`<span>
			${parseTooltipValue(v, true)}
			</span>`);
	}
};
function capitalizeString(s) {
	return  s[0].toUpperCase() + s.slice(1);
};
function isNotEmpty(obj) {
    return Object.keys(obj).length !== 0;
}
function tooltipCallBack(){
    let toptopics, latest_sentiment, tgTopTopics, tgLatestSentiment, mcTopTopics, mcLatestSentiment;
	try {
		tgTopTopics = window.mapTooltipData[this.point['hc-key']]['tg']['top_topics'];
		if (!tgTopTopics) {
			tgTopTopics = [];
		}
	} catch {
		tgTopTopics = [];
	}
	try {
		tgLatestSentiment = window.mapTooltipData[this.point['hc-key']]['tg']['sentiment'];
		if (!tgLatestSentiment){
			tgLatestSentiment = {};
		}
	} catch {
		tgLatestSentiment = {};
	}
	try {
		mcTopTopics = window.mapTooltipData[this.point['hc-key']]['mc']['top_topics'];
		if (!mcTopTopics) {
			mcTopTopics = [];
		}
	} catch {
		mcTopTopics = [];
	}
	try {
		mcLatestSentiment = window.mapTooltipData[this.point['hc-key']]['mc']['sentiment'];
		if (!mcLatestSentiment){
			mcLatestSentiment = {};
		}
	} catch {
		mcLatestSentiment = {};
	}
    if (window.streamKey == 'tg'){
		toptopics = tgTopTopics;
		latest_sentiment = tgLatestSentiment;
    } else if (window.streamKey == 'mc') {
		toptopics = mcTopTopics;
		latest_sentiment = mcLatestSentiment;
    } else if (window.streamKey == 'all') {
		console.log(mcLatestSentiment, tgLatestSentiment)
		toptopics =  tgTopTopics.concat(mcTopTopics);
		toptopics = toptopics.sort((a, b) => a.np - b.np).slice(0, 3)
		latest_sentiment = [tgLatestSentiment, mcLatestSentiment].filter(isNotEmpty);
		if (latest_sentiment.length > 0){
			latest_sentiment = latest_sentiment.sort((a, b) => b.date_id - a.date_id)[0];
		} else {
			latest_sentiment = {};
		}
    }
	
    let html = `<div class="p-3" style="background-color: #f7f7f7">
	<div class="row">
		<h2>${this.point.name}</h2>
		<p> ${capitalizeString(window.selectedLayer)} for ${window.streamKey}: ${parseTooltipValue(this.point.value)} <p>
	</div>
	<div class="row mt-3" style="margin: 0">
		<p class="h6 border-bottom" style="padding: 0">Trending Topics</p>
	</div>
	<div class="row">
		<div class="col">`
        for (let i=0; i < toptopics.length; i++){
			let tid = toptopics[i].topic_id;
			if (window.topics[tid]){
            	html += `<span class="badge rounded-pill badge-theme-${i}">${window.topics[tid].topic}</span>`
			}
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
			${parseTooltipValue(latest_sentiment.sentiment)}
			</span>&nbsp;&nbsp;
			${getTooltipChangeHTML(latest_sentiment.delta)}
		</div>
	</div>
</div>
	`;
    return html
};


export async function renderMap(chartId, data, customOptions, topology) {
	const defaultOptions = {
		// chartType: 'bar',
		// chartHeightRatio: 7 / 16,
		// maxCategoriesVisible: 5,
		// titleText: 'Bar Chart Title',
		// yAxisTitle: 'Value',
		// enableDataLabels: true,
		// enableLegend: false,
		// xAxisRotationAngle: 0,
		// maxWidthBreakpoint: 680,
		// mobileChartHeight: 350
	};

	// Merge custom options with default options
	const opts = { ...defaultOptions, ...customOptions };

	const chartOptions = {
		// OLD SHORT OPTIONS
		chart: {
			map: topology,
			height: (9 / 16 * 100) + '%', // 16:9 ratio
			animation: false,
			backgroundColor: '#bcdae9',
			className: 'highcharts-map'
		},
		title: {
			text: '',
		},
		mapNavigation: {
			enabled: false,
			enableButtons: true,
			buttonOptions: {
				verticalAlign: 'bottom'
			}
		},
		colorAxis: {
			// min: 0
		},
		series: [{
			data: data,
			name: 'Sentiment',
			color: '#d1d3d4',
			states: {
				color: '#d1d3d4',
				hover: {
					color: '#BADA55'
				}
			},
			dataLabels: {
				enabled: true,
				format: '{point.name}'
			}
		}],
		tooltip: {
			useHTML: true,
			formatter: tooltipCallBack
		},
		plotOptions: {
			series: {
				events: {
					click: function(e){
						let url = '/country/' + e.point["hc-key"];
						window.open(url, "_self")
					},
				}
			}
		}
		//
		//
		// NEW OPTIONS
		//chart: {
		//	map: topology,
		//	height: (9 / 16 * 100) + '%' // 16:9 ratio
		//},
		//title: {
		//	text: '',
		//},
		//caption: {
		//	align: 'center',
		//	text: '<div style="max-width: 700px;"><p class="chart-source text-wrap">Using the sentiment score for each document, the map displays the variation in score between documents. Significant negative variations can signal a new or exacerbated shock, whereas positive variations can indicate improvements in a country&#39;s situation. By default, map displays the variation in sentiment score from the latest report available (difference from previous), by country. If filtering for period, map displays the variation for last report in period, by country.</p></div>',
		//	useHTML: true,
		//},
		//mapNavigation: {
		//	enabled: false,
		//	enableButtons: true,
		//	enableDoubleClickZoom: true,
		//	buttonOptions: {
		//		theme: {
		//			fill: 'white',
		//			'stroke-width': 1,
		//			stroke: 'silver',
		//			r: 0,
		//			states: {
		//				hover: {
		//					fill: '#a4edba'
		//				},
		//				select: {
		//					stroke: '#039',
		//					fill: '#a4edba'
		//				}
		//			}
		//		},
		//		verticalAlign: 'bottom',
		//	}
		//},
		//colorAxis: {
		//	tickPositions: legendData["tickPositions"],
		//	stops: legendData["stops"]
		//},
		//series: [{
		//	data: seriesData,
		//	name: 'Latest change of Sentiment Score',
		//	mainMap: 'sentiment',
		//	states: {
		//		hover: {
		//			color: '#BADA55'
		//		}
		//	},
		//	dataLabels: {
		//		enabled: true,
		//		format: '{point.name}'
		//	}
		//}],
		//tooltip: {
		//	useHTML: true,
		//	formatter: tooltipCallBackTemplate
		//},
		//responsive: {
		//	rules: [{
		//		condition: {
		//			maxWidth: 500
		//		},
		//		chartOptions: {
		//			chart: {
		//				height: '190%'
		//			},
		//			mapView: {
		//				//fitToGeometry: polygonGeometry,
		//				center: [14, 1],
		//				zoom: 2.2,
		//				padding: 15
		//			},
		//			legend: {
		//				align: 'center',
		//				//verticalAlign: 'top',
		//				floating: false
		//			},
		//			mapNavigation: {
		//				buttonOptions: {
		//					verticalAlign: 'top'
		//				}
		//			},
		//		}
		//	}]
		//}

	};

	Highcharts.mapChart(chartId, chartOptions);
}