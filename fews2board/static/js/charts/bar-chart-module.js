/**
 * BarChart.js - A JavaScript module for generating customizable bar charts using Highcharts.
 * This module exports a function to render bar charts dynamically based on provided data and user-defined settings.
 *
 * @param {string} chartId - The DOM element ID where the chart will be rendered.
 *
 * @param {Array<Object>} data - The dataset for the chart in JSON format. Each object should have properties as defined in `mappingKeys`.
 * 
 * DATA STRUCTURE
 * Array of objects with the following structure:
 * [{"Topic": "topic", "Value": 1}]
 *
 * @param {Object} mappingKeys - Defines the keys to extract category labels and data values from `data`:
 *   - categoryKey: The key for the category labels on the x-axis.
 *   - valueKey: The key for the data values on the y-axis.
 *   Example:
 *     const mappingKeys = {
 *       categoryKey: 'Name',
 *       valueKey: 'Value'
 *     };
 * @param {Object} customOptions - Optional settings to override default chart options. Provides full customization capability for the chart appearance and behavior.
 *   Available options include chart type, title, axis titles, and more. These options are merged with the default settings provided within the function.
 *
 * Usage Example:
 *   renderBarChart('chart-container', chartData, { categoryKey: 'name', valueKey: 'value' }, { titleText: 'Sample Bar Chart', yAxisTitle: 'Values' });
 *
 * This function relies on Highcharts library, which must be included in your project to function properly.
 */

const noDataHTML = `
    <div class="d-flex justify-content-center align-items-center">
        <div class="fews-country"> NO DATA AVAILABLE</div>
    </div>
`;

export function renderBarChartb(chartId, data, mappingKeys, customOptions) {
	const defaultOptions = {
		chartType: 'bar',
		chartHeightRatio: 7 / 16,
		maxCategoriesVisible: 5,
		titleText: 'Bar Chart Title',
		yAxisTitle: 'Value',
		enableDataLabels: true,
		enableLegend: false,
		xAxisRotationAngle: 0,
		maxWidthBreakpoint: 680,
		mobileChartHeight: 350
	};

	// Merge custom options with default options
	const opts = { ...defaultOptions, ...customOptions };

	// Map data using provided keys
	const categories = data.map(item => item[mappingKeys.categoryKey]);
	const seriesData = data.map(item => item[mappingKeys.valueKey]);

	const chartOptions = {
		chart: {
			type: opts.chartType,
			height: (opts.chartHeightRatio * 100) + '%'
		},
		title: {
			text: opts.titleText,
		},
		xAxis: {
			categories: categories,
			labels: {
				rotation: opts.xAxisRotationAngle,
			},
		},
		yAxis: {
			title: {
				text: opts.yAxisTitle,
			},
		},
		legend: {
			enabled: opts.enableLegend,
		},
		plotOptions: {
			bar: {
				dataLabels: {
					enabled: opts.enableDataLabels
				},
			}
		},
		series: [{
			name: opts.seriesName || 'Data',
			data: seriesData
		}],
		responsive: {
			rules: [{
				condition: {
					maxWidth: opts.maxWidthBreakpoint
				},
				chartOptions: {
					chart: {
						height: opts.mobileChartHeight,
					},
					xAxis: {
						scrollbar: {
							enabled: categories.length > opts.maxCategoriesVisible,
							height: 9,
						},
						min: 0,
						max: categories.length > opts.maxCategoriesVisible ? opts.maxCategoriesVisible : categories.length,
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
                zIndex: 1200,
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
export function renderBarChart(chartId, data, mappingKeys, customOptions) {
	const defaultOptions = {
		chartHeightRatio: 7 / 16,
		chartType: 'bar',
		chartWidth: 400,
		dataLabelsEnabled: true,
		legendEnabled: false,
		maxCategoriesVisible: 7,
		maxWidthBreakpoint: 680,
		mobileChartHeight: 350,
		titleText: 'Bar Chart Title',
		titleUseHTML: false,
		xAxisLabelsEnabled: false,
		xAxisRotationAngle: 0,
		xAxisTitleEnabled: true,
		yAxisTitleEnabled: true,
		yAxisTitleText: undefined,
		xAxisTitleText: undefined,
		backgroundColor: '#4A5975',
		textColor: '#ffffff', 
		infoTooltipText: 'This is a chart tooltip for bar chart data.'
	};

	// Merge custom options with default options
	const opts = { ...defaultOptions, ...customOptions };

	// Map data using provided keys
	const categories = data.map(item => item[mappingKeys.categoryKey]);
	const seriesData = data.map(item => item[mappingKeys.valueKey]);

	const chartOptions = {
		nonHCOptions: {
			infoTooltipText: opts.infoTooltipText
		},
		chart: {
			className: 'hc-bar-chart',
			type: opts.chartType,
			// height: (opts.chartHeightRatio * 100) + '%',
			//width: opts.chartWidth,
			backgroundColor: opts.backgroundColor,
			style: {
				//fontFamily: 'serif',
				color: opts.textColor
				
			  },
			events: {
				load: infoCallBack
			}
		},
		title: {
			useHTML: opts.titleUseHTML,
			text: opts.titleText,
			style: {
				font: 'bold 20px "Trebuchet MS", Verdana, sans-serif',
				color: opts.textColor
			}
		},
		xAxis: {
			className: 'hc-xAxis',
			categories: categories,
			gridLineColor: '#6F7B90',
			labels: {
				enabled: opts.xAxisLabelsEnabled,
				rotation: opts.xAxisRotationAngle,
				style: {
					color: opts.textColor,
					font: '11px Trebuchet MS, Verdana, sans-serif'
				 }
			},
			title: {
				enabled: opts.xAxisTitleEnabled,
				text: opts.xAxisTitleText,
				style: {
					color: opts.textColor,
					fontWeight: 'bold',
					fontSize: '12px',
					fontFamily: 'Trebuchet MS, Verdana, sans-serif'
		
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
					fontSize: '12px',
					fontFamily: 'Trebuchet MS, Verdana, sans-serif'
				 },
			},
			labels: {
				style: {
				   color: opts.textColor,
				   font: '11px Trebuchet MS, Verdana, sans-serif'
				}
			 }
		},
		legend: {
			enabled: opts.legendEnabled,
			itemStyle: {
				color: opts.textColor
			}
		},
		plotOptions: {
			bar: {
				dataLabels: {
					enabled: opts.dataLabelsEnabled,
					align: 'center',
					inside: true,
					// format: '{x} - ({point.y})',
					formatter: function () {
						return this.x ;
					},
					borderWidth: 0,
					style: {
						textOutline: 'none'
					}
					
				},
				borderRadius: 0,
				borderWidth: 0,
				colorByPoint: true
			}
		},
		series: [{
			name: opts.seriesName || 'Data',
			data: seriesData
		}],
		responsive: {
			rules: [{
				condition: {
					maxWidth: opts.maxWidthBreakpoint
				},
				chartOptions: {
					chart: {
						// height: opts.mobileChartHeight,
					},
					xAxis: {
						scrollbar: {
							enabled: categories.length > opts.maxCategoriesVisible,
							height: 9,
						},
						min: 0,
						max: categories.length > opts.maxCategoriesVisible ? opts.maxCategoriesVisible : categories.length,
					}
				}
			}]
		}
	};

	Highcharts.chart(chartId, chartOptions);
}
export async function renderBarChartFromUrl(
    chartId, url, mappingKeys, customOptions
){
   await fetch(url).then(
    response => response.json())
    .then(data => {
		if (data.length ==0){
			$(`#${chartId}`).html(noDataHTML)
		} else {
        	renderBarChart(chartId, data, mappingKeys, customOptions);
			// $('.highcharts-background').css('fill', window.chartBackground);
			// $(`#${chartId} text`).css('fill', window.chartTextColor);
		}
    });

};