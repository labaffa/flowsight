const polygonGeometry = {
	// https://jsfiddle.net/gh/get/library/pure/highcharts/highcharts/tree/master/samples/maps/mapview/fittogeometry
	type: 'Polygon',
	coordinates: [
	  [
		// Africa
		/* [-17, 32],
		[51, 32],
		[51, -30],
		[-17, -30],
		[-17, 32] */
		[-30, 32],
        [65, 32],
        [65, -40],
        [-30, -40],
        [-30, 32]

	  ]
	]
  };


async function sentimentMapData(
	period_start='2013-01-01', 
	period_end='2024-01-01',
	topic_list=[]

){
	let endpoint = '/average_sentiment';
	let queryParams = $.param(
		{
			period_start: period_start,
			period_end: period_end,
			topic_list: topic_list
		},
		traditional=true
	);
	let request = {
		datatype: 'json',
		cache: false,
		data: queryParams,
		beforeSend: function() {
			// Changed here to insert the spinner - it get overwritten anyways.
				$('#sentiment-map').html('<div class="spinner-border fews-country" role="status"><span class="visually-hidden">Loading...</span></div>');
			},
		success: function(response) {
			try {
				window.sentimentMapData = response;
				
			} 
			catch(error) {
				console.error(error);
			}
		}
	};
	$.ajax(endpoint, request);
};


async function sentimentMap( 
	mapsData
	){
	try {
		const topology = await loadMap();
		const seriesData = await processChartData(mapsData);
		const options = await getChartOptions(topology, seriesData);
		thisChart = await renderChart('sentiment-map', options);
		window.mapChart = thisChart;
		return thisChart;
		} 
	catch(error) {
		console.error(error);
	}


	async function loadMap() {
		try {
			const topology = await fetch('static/js/charts/custom-map-topology.json')
			.then(response => response.json());
			return topology;
		} catch (error) {
			throw new Error('Error loading map');
		}
	}

	async function processChartData(data) {
		const seriesData = data.map(item => {
			const country = item.country;
			const sentiment = Number.parseFloat(item.sentiment).toFixed(2);
			item["hc-key"] = country;
			item["value"] = sentiment;
			return item;
		});
		//seriesData.sort((a, b) => a.sentiment - b.sentiment);
		return seriesData;
	};
	
	
	async function getChartOptions(topology, seriesData) {
		const legendMin = window.statsForMaps.sentiment.min;
		const legendMax = window.statsForMaps.sentiment.max;
		const legendData = legendTicksData(legendMin, legendMax);
		
		return {
			plotOptions: {
				series: {
					events: {
						click: function(e){
							let url = '/country/' + window.fewsnetCountries[
								e.point["hc-key"]]["bgn_proper"];
							if (window.pre_2013 == true) {
								url = url + '?pre_2013=true'
							}
							window.open(url, "_self")
						},
					}
				}
			},
			chart: {
				map: topology,
				height: (9 / 16 * 100) + '%' // 16:9 ratio
			},
			title: {
				text: '',
			},
			caption: {
                align: 'center',
                text: '<div style="max-width: 700px;"><p class="chart-source text-wrap">Displays the average sentiment score for documents within the selected period, by country. If filtering for period and topic, the map displays the average sentiment score, only for countries where the topic was detected in documents within the selected period.</p><p class="chart-source"><b>Scale</b>: -1 to 1</p></div>',
				useHTML: true,
            },
			mapNavigation: {
				enabled: false,
				enableButtons: true,
				enableDoubleClickZoom: true,
				buttonOptions: {
                    theme: {
                        fill: 'white',
                        'stroke-width': 1,
                        stroke: 'silver',
                        r: 0,
                        states: {
                            hover: {
                                fill: '#a4edba'
                            },
                            select: {
                                stroke: '#039',
                                fill: '#a4edba'
                            }
                        }
                    },
					verticalAlign: 'bottom',
				}
			},
			colorAxis: {

				tickPositions: legendData["tickPositions"],
				stops: legendData["stops"]
			},
			series: [{
				data: seriesData,
				//joinBy: ['hc-key', 'code'],
				name: 'Average Sentiment Score',
				mainMap: 'sentiment',
				states: {
					hover: {
						color: '#D5742F'
					}
				},
				dataLabels: {
					enabled: true,
					format: '{point.name}'
				}
			}
		],
			tooltip: {
				useHTML: true,
				formatter: tooltipCallBackTemplate
			},
			mapView: {
				//zoom: 1,
				padding: 15
			},

			responsive: {
				rules: [{
					condition: {
						maxWidth: 500
					},
					chartOptions: {
						chart: {
							height: '190%'
						},
						mapView: {
							//fitToGeometry: polygonGeometry,
							center: [14, 1],
							zoom: 2.2,
							padding: 15
						},
						legend: {
							
							align: 'center',
							//verticalAlign: 'top',
							floating: false
						},
						mapNavigation: {
							buttonOptions: {
								verticalAlign: 'top'
							}
						},
					}
				}]
			},
		};
	};

	// Render chart
	async function renderChart(chartId, options) {
		thisChart = new Highcharts.mapChart(chartId, options);
		return thisChart;
		
	};
};


