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

const infoCallBack = function() {
	// https://www.highcharts.com/forum/viewtopic.php?t=49354

	const chart = this;
	let info = $(chart.userOptions.title.text).find('.info-icon').first();
	
	// console.log(chart);
	
    if (info.length == 0) {
		return;
	}
	const iconId = info.attr('id');
	if (!iconId) {
		return;
	}
	info = document.querySelector(`#${iconId}`);
    info.addEventListener('mouseover', function() {
		const titleBBox = chart.title.getBBox()
        if (!chart.infoTooltip) {
			
            chart.infoTooltip = chart.renderer.label(
				chart.userOptions.nonHCOptions.infoTooltipText, 
				10, 10, 
				'rect', 
				chart.title.alignAttr.x + titleBBox.width, chart.title.alignAttr.y / 2, 
				true, false, 
				'info-label'  // https://www.highcharts.com/forum/viewtopic.php?t=38130
			)
			.attr({
                zIndex: 12,
                fill: 'rgba(0, 0, 0) !important',
                'stroke-width': 1,
                stroke: 'white',
                padding: 8,
                r: 3,
            })
			.add();
        }
        
        const bBox = chart.infoTooltip.getBBox(),
            x = chart.title.alignAttr.x + titleBBox.width + 24,
            y = chart.title.alignAttr.y / 2;
        chart.infoTooltip.show();
        chart.infoTooltip.attr({x, y})
    });
    info.addEventListener('mouseout', function() {
        chart.infoTooltip.hide();
    });
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
		titleUseHTML: false,
		tooltipPointText: 'Correlation: ',
		xAxisType: 'datetime',
		xAxisTitleText: undefined,
		xAxisTitleEnabled: true,
		yAxisTitleEnabled: true,
		yAxisTitleText: undefined,
		backgroundColor: '#4A5975',
		textColor: '#ffffff',
		turboThreshold: 10000,
		tooltipPointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y:.3f}',
		infoTooltipText: 'This is a chart tooltip for time series data.',
		marginLeft: 150
	};

	const opts = { ...defaultOptions, ...customOptions };

	let seriesData = data;
	seriesData.forEach(serie => {
		if (serie.name.toLowerCase() === "social") {
			serie.className = "social-color";
		} else if (serie.name.toLowerCase() === "media") {
			serie.className = "media-color";
		}
	});
	
	
	const chartOptions = {
		nonHCOptions: {
			infoTooltipText: opts.infoTooltipText
		},
		chart: {
			// className: 'hc-line-chart',
			height: null,
			// height: (opts.chartHeightRatio * 100) + '%',
			type: opts.chartType,
			// width: opts.chartWidth,
			zoomType: 'x',
			marginLeft: opts.marginLeft,
			backgroundColor: opts.backgroundColor,
			style: {
				//fontFamily: 'serif',
				color: opts.textColor
				
			},
			events: {
				load: infoCallBack
			},
			
			
		},
		title: {
			useHTML: opts.titleUseHTML,
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
				turboThreshold: opts.turboThreshold,
				
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
				 x: -40
			},
			labels: {
				style: {
				   color: opts.textColor,
				   font: '11px Trebuchet MS, Verdana, sans-serif'
				},
				align: 'left',
				y: 0,
				x: -40
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
	return seriesData.sort((a, b) => {
		if (a.name < b.name) {
			return -1;
		}
		if (a.name > b.name) {
			return 1;
		}
		return 0;
	});
	
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
	return seriesData.sort((a, b) => {
		if (a.name < b.name) {
			return -1;
		}
		if (a.name > b.name) {
			return 1;
		}
		return 0;
	});
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