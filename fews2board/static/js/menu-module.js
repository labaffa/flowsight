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
    }
};

