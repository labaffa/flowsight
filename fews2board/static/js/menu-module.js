import { renderBarChart } from "./charts/bar-chart-module.js";
import { renderLineChart } from "./charts/line-chart-module.js";
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
        0: {"name": "Line Chart", "endpoint": "/{alpha_2}/filter_attention_trends", "chart": renderLineChart}, 
        1: {"name": "Wordcloud", "endpoint": ""}, 
        2: {"name": "Bar Chart", "endpoint": ""}
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
        0: {"name": "Title", "value": "titleText"}, 
        1: {"name": "X Axis Title", "value": "xAxisTitleText"}, 
        2: {"name": "Y Axis Title", "value": "yAxisTitleText"}
    }
};

