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
        titleUseHTML: false,
		xAxisLabelsEnabled: false,
		xAxisRotationAngle: 0,
		xAxisTitleEnabled: false,
		yAxisTitleEnabled: false,
		yAxisTitleText: 'Value',
        infoTooltipText: 'This is a chart tooltip for wordcloud data.'

	};
    // Merge custom options with default options
	const opts = { ...defaultOptions, ...customOptions };
    let height = opts.chartHeightRatio ? (opts.chartHeightRatio * 100) + '%' : null;
    let width = opts.chartWidth ? opts.chartWidth : null;
    // Map data using provided keys
	const remappedData = remapData(data, mappingKeys);
	
    const chartOptions = {
        nonHCOptions: {
			infoTooltipText: opts.infoTooltipText
		},
        chart: {
            type: 'wordcloud',
            height: height,
            width: width,
            events: {
				load: infoCallBack
			}
        },
        title: {
			text: opts.titleText,
            useHTML: opts.titleUseHTML
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