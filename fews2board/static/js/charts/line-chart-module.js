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
	console.log(seriesData)
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
export function renderLineChart(chartId, data, customOptions) {
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
		yAxisTitleEnabled: false,
		yAxisTitleText: 'yAxis New Title',
	};

	const opts = { ...defaultOptions, ...customOptions };

	let seriesData = data;

	const chartOptions = {
		chart: {
			// height: (opts.chartHeightRatio * 100) + '%',
			type: opts.chartType,
			// width: opts.chartWidth,
			zoomType: 'x',
			marginLeft: 150,
		},
		title: {
			text: opts.titleText
		},
		plotOptions: {
			series: {
				marker: {
					enabled: false
				},
			},
		},
		xAxis: {
			type: opts.xAxisType,
		},
		yAxis: {
			title: {
				enabled: opts.yAxisTitleEnabled,
				text: opts.yAxisTitleText,
			}
		},
		legend: {
			align: 'right',
			verticalAlign: 'top',
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
function processChartData(data, dateKey) {
	if (data.length === 0){
		return [];
	}
	const seriesData = [];
	const topics = Object.keys(data[0]).filter(key => key !== dateKey);
	for (const topic of topics) {
		const series = {
			name: topic,
			data: []
		};
		for (const item of data) {
			const dateParts = item[dateKey].split('-').map(part => parseInt(part));
			const date = Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]);
			
			const value = parseFloat(item[topic]) ? item[topic] : 0;
			series.data.push([date, value]);
		}
		seriesData.push(series);
	}
	return seriesData;
};

export async function renderLineChartFromUrl(
    chartId, url, customOptions, dateKey
){
   let data = await fetch(url)
   	.then(response => response.json())
	.then(data => {
		console.log(data)
		data = processChartData(data, dateKey);
		console.log("mctrend", data)
		renderLineChart(chartId, data, customOptions);
	});
	
    
};