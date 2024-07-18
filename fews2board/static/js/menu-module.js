import { renderBarChart, renderBarChartFromUrl } from "./charts/bar-chart-module.js";
import { renderLineChart, renderLineChartFromUrl } from "./charts/line-chart-module.js";
import { renderWordCloud } from "./charts/wordcloud-module.js";


export var filterStructure = {
    "tg": {
        
        "Topic": {
                "operators": ["IS"],
                "value": Object.keys(window.topicsByName)
            },
        "Sentiment": {
            "operators": ["IS", "IS NOT"],
            "value": ["negative", "positive"]
        },
        "Emotion": {
            "operators": ["IS", "IS NOT"],
            "value": ["anger", 
            "anticipation", "disgust", "fear", "joy",
            "sadness", "surprise", "trust"]
        },
        // "Keyword": {
        //     "operators": ["CONTAINS", "DOES NOT CONTAIN"],
        //     "value": []
        // }
    },
    "mc": {
        
        "Topic": {
                "operators": ["IS"],
                "value": Object.keys(window.topicsByName)
            },
        "Sentiment": {
            "operators": ["IS", "IS NOT"],
            "value": ["negative", "positive"]
        },
        "Emotion": {
            "operators": ["IS", "IS NOT"],
            "value": ["anger", 
            "anticipation", "disgust", "fear", "joy",
            "sadness", "surprise", "trust"]
        },
        // "Keyword": {
        //     "operators": ["CONTAINS", "DOES NOT CONTAIN"],
        //     "value": []
        // },
        // "Entity": {
        //     "operators": ["IS", "IS NOT"],
        //     "value": []
        // }
    },
    "studio": {
        
        "Topic": {
                "operators": ["IS"],
                "value": Object.keys(window.topicsByName)
            },
        "Sentiment": {
            "operators": ["IS", "IS NOT"],
            "value": ["negative", "positive"]
        },
        "Emotion": {
            "operators": ["IS", "IS NOT"],
            "value": ["anger", 
            "anticipation", "disgust", "fear", "joy",
            "sadness", "surprise", "trust"]
        },
        // "Keyword": {
        //     "operators": ["CONTAINS", "DOES NOT CONTAIN"],
        //     "value": []
        // }
    },    
};

export var studioFilterStructure = {
    "charts": {
        0: {"name": "Line Chart", "endpoint": "/studio_line_chart", "chart": renderLineChartFromUrl}, 
        1: {"name": "Bar Chart", "endpoint": "/studio_bar_chart", "chart": renderBarChartFromUrl}
    },
    "fields": {
        0: {"name": "Attention (social)", "stream": "tg", "type": "attention"}, 
        1: {"name": "Sentiment (social)", "stream": "tg", "type": "sentiment"}, 
        2: {"name": "Emotion (social)", "stream": "tg", "type": "emotion"}, 
        3: {"name": "Synthetic Search Index", "stream": "si", "type": "ssi_index"},
        4: {"name": "Attention (media)", "stream": "mc", "type": "attention"},
        5: {"name": "Sentiment (media)", "stream": "mc", "type": "sentiment"},
        6: {"name": "Emotion (media)", "stream": "mc", "type": "emotion"}
    },
    "variables": {
        0: {"name": "Title", "value": "titleText", "defaultValue": ""}, 
        1: {"name": "X Axis Title", "value": "xAxisTitleText", "defaultValue": ""}, 
        2: {"name": "Y Axis Title", "value": "yAxisTitleText", "defaultValue": ""},
        3: {"name": "Background Color", "value": "backgroundColor", "defaultValue": '#4A5975'},
        4: {"name": "Text Color", "value": "textColor", "defaultValue": '#ffffff'}
    }
};

