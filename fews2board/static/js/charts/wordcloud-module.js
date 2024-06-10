const noDataHTML = `
    <div class="d-flex justify-content-center align-items-center">
        <div class="fews-country"> NO DATA AVAILABLE</div>
    </div>
`;

function remapData(data, mappingKeys) {
    return data.map(item => ({
        'name': item[mappingKeys.categoryKey],
        'weight': parseFloat(item[mappingKeys.valueKey])
    }));
}


export function renderWordCloud(chartId, data, mappingKeys, customOptions) {
    const defaultOptions = {
		chartHeightRatio: 7 / 16,
		chartType: 'wordcloud',
		chartWidth: 400,
		dataLabelsEnabled: true,
		legendEnabled: false,
		maxCategoriesVisible: 7,
		maxWidthBreakpoint: 680,
		//mobileChartHeight: 350,
		titleText: 'Significat Terms',
		xAxisLabelsEnabled: false,
		xAxisRotationAngle: 0,
		xAxisTitleEnabled: false,
		yAxisTitleEnabled: false,
		yAxisTitleText: 'Value',
	};
    // Merge custom options with default options
	const opts = { ...defaultOptions, ...customOptions };
    let height = opts.chartHeightRatio ? (opts.chartHeightRatio * 100) + '%' : null;
    let width = opts.chartWidth ? opts.chartWidth : null;
    // Map data using provided keys
	const remappedData = remapData(data, mappingKeys);
	
    const chartOptions = {
        chart: {
            type: 'wordcloud',
            height: height,
            width: width
        },
        title: {
			text: opts.titleText,
		},
        xAxis: {
            visible: false,
        },
        tooltip: {
            valueDecimals: 2
        },
        series: [{
            type: 'wordcloud',
            //colorByPoint: false,
            data: remappedData,
            name: 'Prevalence'
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
					
				}
			}]
		}
    }
	Highcharts.chart(chartId, chartOptions);

};