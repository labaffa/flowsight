/**
 * LineChart.js -  A JavaScript module for generating line charts with Highcharts.
 *  Exports a function to render line charts dynamically based on provided data and options.
 *
 * @param {string} chartId - DOM element ID where the chart will be rendered.
 * @param {Array<Object>} data - Series data (pre-formatted for Highcharts).
 * @param {Object} customOptions - Optional settings to override default chart options.
 *
 * DATA STRUCTURE
 *   [{
 *   	name: "name",
 *   	data: [
 *   	       { x: 1603929600000, y: 0.75 },
 *   	       { x: 1590105600000, y: 0.68 },
 *   	       // ...
 *   	]
 *   }, ...
 *   ]
 */
const noDataHTML = `
    <div class="d-flex justify-content-center align-items-center">
        <div class="fews-country"> NO DATA AVAILABLE</div>
    </div>
`;
export function renderLineChartb(chartId, data, customOptions) {
	const defaultOptions = {
		chartType: 'spline',
		titleText: 'Timeline Title',
		xAxisType: 'datetime',
		yAxisTitleText: 'yAxis Title',
		tooltipPointText: 'Correlation: ',
		seriesName: 'Series Name',
		dataLabelsEnabled: true,
		maxWidth: 800
	};

	const opts = { ...defaultOptions, ...customOptions };

	// const seriesData = data.map(item => ({
	// 	name: item.name,
	// 	data: item.data.map(dataPoint => [dataPoint.x, dataPoint.y])
	// }));
	let seriesData = data;
	const chartOptions = {
		chart: {
			type: opts.chartType,
			zoomType: 'x',
			// height: (7 / 16 * 100) + '%' // 16:7 ratio
			height: null,
		},
		title: {
			text: opts.titleText
		},
		xAxis: {
			type: opts.xAxisType,
		},
		yAxis: {
			title: {
				text: opts.yAxisTitleText,
			}
		},
		tooltip: {
			pointFormat: opts.tooltipPointText + '{point.y:.2f}',
		},
		series: seriesData,
		responsive: {
			rules: [{
				condition: {
					maxWidth: opts.maxWidth,
				},
				chartOptions: {
					caption: {
						text: ''
					},
					chart: {
						// height: 350,
					},
					xAxis: {
						// scrollbar: {
						// 	enabled: (mx < sl),
						// 	height: 9,
						// },
						// min: smMin,
						// max: smMax,
					},
					yAxis: {
						title: null,
						labels: {
							enabled: true,
							rotation: -90
						},

					},

				}
			},
			{
				condition: {
					minWidth: 800,
				},
				chartOptions: {
					rangeSelector: {
						selected: 1
					},
					chart: {
						height: 350,

						/* scrollablePlotArea: {
							minWidth: 700,
							scrollPositionX: 0
						} */
					}
				}
			}]
		}
	};

	Highcharts.chart(chartId, chartOptions);
}
export function renderTimeSeries(chartId, data, customOptions) {
	const defaultOptions = {
		// chartHeightRatio: 7 / 16,
		chartType: 'line',
		chartWidth: 600,
		dataLabelsEnabled: true,
		maxWidth: 800,
		seriesName: 'Series Name',
		titleText: 'Timeline Title',
		tooltipPointText: 'Correlation: ',
		xAxisType: 'datetime',
		xAxisTitleText: undefined,
		xAxisTitleEnabled: true,
		yAxisTitleEnabled: true,
		yAxisTitleText: undefined,
		backgroundColor: '#4A5975',
		textColor: '#ffffff',
		tooltipPointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y}'
	};

	const opts = { ...defaultOptions, ...customOptions };

	let seriesData = data;

	const chartOptions = {
		chart: {
			// className: 'hc-line-chart',
			height: null,
			// height: (opts.chartHeightRatio * 100) + '%',
			type: opts.chartType,
			// width: opts.chartWidth,
			zoomType: 'x',
			marginLeft: 150,
			backgroundColor: opts.backgroundColor,
			style: {
				//fontFamily: 'serif',
				color: opts.textColor
				
			  }
		},
		title: {
			text: opts.titleText,
			style: {
				font: 'bold 20px "Trebuchet MS", Verdana, sans-serif',
				color: opts.textColor
			}
		},
		plotOptions: {
			column: {
                pointPadding: 0.2,
                borderWidth: 0,
                grouping: true
            },
			series: {
				marker: {
					enabled: false,
				},
			},
		},
		xAxis: {
			type: opts.xAxisType,
			className: 'hc-xAxis',
			gridLineColor: '#6F7B90',
			title: {
				enabled: opts.xAxisTitleEnabled,
				text: opts.xAxisTitleText, 
				style: {
					color: opts.textColor,
					fontWeight: 'bold',
					fontSize: '16px',
					fontFamily: 'Trebuchet MS, Verdana, sans-serif'
		
				 }     
				
			},
			labels: {
				style: {
				   color: opts.textColor,
				   font: '11px Trebuchet MS, Verdana, sans-serif'
				}
			 },
		},
		yAxis: {
			className: 'hc-yAxis',
			gridLineColor: '#6F7B90',
			title: {
				
				enabled: opts.yAxisTitleEnabled,
				text: opts.yAxisTitleText,
				style: {
					color: opts.textColor,
					fontWeight: 'bold',
					fontSize: '16px',
					fontFamily: 'Trebuchet MS, Verdana, sans-serif'
				 },
			},
			labels: {
				style: {
				   color: opts.textColor,
				   font: '11px Trebuchet MS, Verdana, sans-serif'
				}
			 },
		},
		legend: {
			align: 'right',
			verticalAlign: 'top',
			itemStyle: {
				color: opts.textColor,
				fontWeight: 'normal' 
			}

		},
		tooltip: {
			pointFormat: opts.tooltipPointFormat,
			
		},
		series: seriesData,
		responsive: {
			rules: [{
				condition: {
					maxWidth: opts.maxWidth,
				},
				chartOptions: {
					caption: {
						text: ''
					},
					chart: {
						// height: 350,
					},
					xAxis: {
						// scrollbar: {
						// 	enabled: (mx < sl),
						// 	height: 9,
						// },
						// min: smMin,
						// max: smMax,
					},
					yAxis: {
						title: null,
						labels: {
							enabled: true,
							rotation: -90
						},

					},

				}
			},
			{
				condition: {
					minWidth: 800,
				},
				chartOptions: {
					rangeSelector: {
						selected: 1
					},
					chart: {
						//height: 350,

						/* scrollablePlotArea: {
							minWidth: 700,
							scrollPositionX: 0
						} */
					}
				}
			}]
		}
	};

	Highcharts.chart(chartId, chartOptions);
	

}

export function processOverallChartData(data, dateKey, customKeys=[]) {
	if (data.length === 0){
		return [];
	}
	
	const seriesData = [];
	for (const series of data) {
		
		series.data = series.data.map(item => {
			return {
				x: item[dateKey],
				y: item.value,
				...item
			};
		}).sort(function(a, b) {
			return a.x - b.x;
		});
		seriesData.push(series);
	}
	seriesData.sort((a, b) => {
		if (a.name < b.name) {
			return 1;
		}
		if (a.name > b.name) {
			return -1;
		}
		return 0;
	});
	return seriesData;
};


export function processChartData(data, dateKey, customKeys=[]) {
	if (data.length === 0){
		return [];
	}
	const colsToExclude = [dateKey, ...customKeys];
	const seriesData = [];
	const topics = Object.keys(data[0]).filter(key => !colsToExclude.includes(key));
	for (const topic of topics) {
		const series = {
			name: topic,
			data: []
		};
		for (const item of data) {
			const dateParts = item[dateKey].split('-').map(part => parseInt(part));
			const date = Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]);
			
			const value = parseFloat(item[topic]) ? item[topic] : 0;
			series.data.push({x: date, y: value});
		}
		series.data = series.data.sort(function(a, b) { return a.x - b.x; });
		seriesData.push(series);
	}
	console.log(seriesData)
	return seriesData;
};

export async function renderTimeSeriesFromUrl(
    chartId, url, customOptions, dateKey, customKeys=[]
){
   let data = await fetch(url)
   	.then(response => response.json())
	.then(data => {
		if (data.length == 0 ) {
			$(`#${chartId}`).html(noDataHTML);
		} else {

			data = processChartData(data, dateKey, customKeys);
			renderTimeSeries(chartId, data, customOptions);
			// $('.highcharts-background').css('fill', window.chartBackground);
			// $(`#${chartId} text`).css('fill', window.chartTextColor);
		}
	});
	
    
};

export async function renderOverallTimeSeriesFromUrl(
    chartId, url, customOptions, dateKey, customKeys=[]
){
   let data = await fetch(url)
   	.then(response => response.json())
	.then(data => {
		if (data.length == 0 ) {
			$(`#${chartId}`).html(noDataHTML);
		} else {

			data = processOverallChartData(data, dateKey, customKeys);
			renderTimeSeries(chartId, data, customOptions);
			// $('.highcharts-background').css('fill', window.chartBackground);
			// $(`#${chartId} text`).css('fill', window.chartTextColor);
		}
	});
	
    
};