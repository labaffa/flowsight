export function renderColumnChart(chartId, data, mappingKeys, customOptions) {
	const defaultOptions = {
		chartHeightRatio: 7 / 16,
		chartType: 'column',
		chartWidth: 400,
		dataLabelsEnabled: true,
		isSSI: false,
		legendEnabled: false,
		maxCategoriesVisible: 5,
		maxWidthBreakpoint: 680,
		mobileChartHeight: 350,
		titleText: 'Bar Chart Title',
		xAxisLabelsEnabled: true,
		xAxisRotationAngle: 0,
		xAxisTitleEnabled: false,
		yAxisTitleEnabled: false,
		yAxisTitleText: 'Value',
	};

	// Merge custom options with default options
	const opts = { ...defaultOptions, ...customOptions };

	// Map data using provided keys
	const categories = data.map(item => item[mappingKeys.categoryKey]);
	// const seriesData = data.map(item => item[mappingKeys.valueKey]);

	const chartOptions = {
		chart: {
			height: (opts.chartHeightRatio * 100) + '%',
			type: opts.chartType,
			width: opts.chartWidth,
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
			column: {
				dataLabels: {
					enabled: opts.dataLabelsEnabled,
					align: 'center',
					inside: true,
					format: '{point.y}'
				},
				borderRadius: 0,
				colorByPoint: true
			}
		},
		series: [{
			name: opts.seriesName || 'Data',
			data: data.map(item => ({
				className: opts.isSSI ? 'ssi-column' : undefined,
				y: item[mappingKeys.valueKey]
			})),
			groupPadding: 0.01,
			pointPadding: 0.01,
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
							// enabled: categories.length > opts.maxCategoriesVisible,
							height: 9,
						},
						min: 0,
						// max: categories.length > opts.maxCategoriesVisible ? opts.maxCategoriesVisible : categories.length,
					}
				}
			}]
		}
	};

	Highcharts.chart(chartId, chartOptions);
}