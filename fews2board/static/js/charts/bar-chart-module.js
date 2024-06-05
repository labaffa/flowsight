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
		xAxisLabelsEnabled: false,
		xAxisRotationAngle: 0,
		xAxisTitleEnabled: false,
		yAxisTitleEnabled: false,
		yAxisTitleText: 'Value',
	};

	// Merge custom options with default options
	const opts = { ...defaultOptions, ...customOptions };

	// Map data using provided keys
	const categories = data.map(item => item[mappingKeys.categoryKey]);
	const seriesData = data.map(item => item[mappingKeys.valueKey]);

	const chartOptions = {
		chart: {
			type: opts.chartType,
			// height: (opts.chartHeightRatio * 100) + '%',
			//width: opts.chartWidth,
		},
		title: {
			text: opts.titleText,
		},
		xAxis: {
			categories: categories,
			labels: {
				enabled: opts.xAxisLabelsEnabled,
				rotation: opts.xAxisRotationAngle,
			},
			title: {
				enabled: opts.xAxisTitleEnabled
			},
		},
		yAxis: {
			title: {
				enabled: opts.yAxisTitleEnabled,
				text: opts.yAxisTitleText,
			},
		},
		legend: {
			enabled: opts.legendEnabled,
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
					}
					
				},
				borderRadius: 0,
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
		}
    });

};