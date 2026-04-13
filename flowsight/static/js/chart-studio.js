import { filterStructure, studioFilterStructure } from "menu";
import { renderBarChart, renderBarChartFromUrl } from "bar-chart";
import { processChartData, renderTimeSeries, renderTimeSeriesFromUrl } from "line-chart";
import { renderWordCloud } from "wordcloud";
import { showInfoPopup, hideInfoPopup } from "utils";


Highcharts.setOptions({
	chart: {
		borderRadius: 5,
        //height: '100%'
	},
	credits: {
		text: '',
	},
	title: {
		align: "left",
	},
	xAxis: {
		title: {
			margin: 8,
		},
		labels: {
			rotation: 0,
		},
	},
	yAxis: {
		title: {
			margin: 8,
		},
	},
    // Set options for export module.
	exporting: {
		buttons: {
			contextButton: {
				menuItems: ["viewFullscreen", "separator", "downloadPNG", "downloadJPEG", "downloadPDF", "downloadSVG", "downloadCSV", "downloadXLS"],
			},
		},
	},
});

// // Inizializza gli array per i primi e i secondi elementi
// const startDates = [];
// const endDates = [];

// // Itera su tutte le chiavi dell'oggetto
// for (const key in window.dateRanges) {
//     if (window.dateRanges.hasOwnProperty(key)) {
//         startDates.push(window.dateRanges[key][0]);
//         endDates.push(window.dateRanges[key][1]);
//     }
// }

// // Calcola il minimo tra i primi elementi
// window.startDate = Math.min(...startDates);

// // Calcola il massimo tra i secondi elementi
// window.endDate = Math.max(...endDates);

window.startDate = window.dateRanges.min_date;
window.endDate = window.dateRanges.max_date;


window.conditionCounter = {
    "studio": 0
}

// should rename countryConditions to just Conditions since it's global on chart studio
window.countryConditions = {
    "studio": []
}
window.selectedChart = 0;
window.selectedCountries = [parseInt(window.defaultCountry.country_id)];
window.selectedFields = {};
window.selectedVariables = {};

window.chartBackground = '#4A5975';
window.chartTextColor = 'white';

window.MessagesOffset = {
    "tg": 0, "mc": 0
};
window.MessagesLimit = {
    "tg": 10, "mc": 10
}

window.tgMessageMaxLen = 300;
window.mcStoryMaxLen = 300;


function prettyPrintConditions(conditions){
    let grouped = conditions.reduce((acc, item) => {
        const key = `${item.field}-${item.operator}`;
        if (!acc[key]) {
            
          acc[key] = {
            field: item.field,
            operator: item.operator,
            value: new Set()
          };
        }
        acc[key].value.add(item.value);
        return acc;
      }, {});
    let result = Object.values(grouped).map(group => ({
        field: group.field,
        operator: group.operator,
        value: Array.from(group.value)
      }));
      let parts = result.map(x => {
        let values = x.value.map(
            b => x.field.toLowerCase() == "topic" ? window.topicsById[b].toString() : b.toString()).join(', ');
        return `[${x.field} ${x.operator} (${values})]`;
      });
      
      return parts.join(' AND ');
};

function fillSearchBar(stream){
    if (window.countryConditions[stream].length > 0){
        console.log("filling search")
        
        $(`#${stream}-filter-bar .search-bar`).attr('placeholder', prettyPrintConditions(window.countryConditions[stream]))
    } else {
        $(`#${stream}-filter-bar .search-bar`).attr('placeholder', 'Build a query...')
    }
};

function initPicker(pickerId) {
    let start, end, startDate, endDate;
    start = moment(window.startDate.toString());
    end = moment(window.endDate.toString());
    
    
    function cb(start, end) {
        $(`#${pickerId} span`).html(start.format('DD/MM/YYYY') + ' - ' + end.format('DD/MM/YYYY'));
    }
    $(`#${pickerId}`).daterangepicker({
        startDate: start,
        endDate: end,
        minDate: start,
        maxDate: end,
        linkedCalendars: false,
        showDropdowns: true,
        autoApply: true
    }, cb);
    cb(start, end);
};
$('.datepicker').on('apply.daterangepicker', function(ev, picker) {
    window.startDate = parseInt(picker.startDate.format('YYYYMMDD'));
    window.endDate = parseInt(picker.endDate.format('YYYYMMDD'));
});

const noDataHTML = `
    <div class="d-flex justify-content-center align-items-center h-100">
        <div class="fews-country"> NO DATA AVAILABLE</div>
    </div>
`;


const noDataHTMLSocial = `
    
    <div class="d-flex justify-content-center align-items-center h-100">
        <div class="fews-country"> NO DATA AVAILABLE</div>
    </div>
`;
const noDataHTMLMedia = `
    
    <div class="d-flex justify-content-center align-items-center h-100">
        <div class="fews-country"> NO DATA AVAILABLE</div>
    </div>
`;

function initTopicField(eleId){
    const a = {};
    window.topics.forEach( t => {
        if (!a[t.domain]) {
            a[t.domain] = [];
          }
          a[t.domain].push({"label": t.topic, "value": t.topic_id});
    })
    
    const groupedOptions = Object.keys(a).map(key => ({
        label: key,
        options: a[key]
    }));
    // placeHolder = `-- ${placeHolder} [${options.length}] --`
    VirtualSelect.init({
      ele: eleId,
      options: groupedOptions,
      multiple: true,
      search: false,
      disableSelectAll: true,
      showSelectedOptionsFirst: true,
      placeholder: 'Select topic...'
    }
    )
  }

  function conditionTemplate(index, stream, logicDiv){
    return `<div class="condition" id="${stream}-condition-${index}">
        ${logicDiv}
        <div class="d-flex justify-content-center align-items-center">
            <div class="field-condition sub-condition">
                <label for="${stream}-field-select-${index}">Field:</label><br>
                <select id="${stream}-field-select-${index}" class="field-select">
                    
                </select>
            </div>
            <div class="operator-condition sub-condition">
                <label for="${stream}-operator-select-${index}">Operator:</label><br>
                <select id="${stream}-operator-select-${index}">
                    
                </select>
            </div>
            <div class="value-condition sub-condition wrapper">
                <label for="${stream}-value-condition-${index}">Value:</label><br>
                <div class="value-condition sub-condition vscontainer" id="${stream}-value-condition-${index}">
            </div>
            </div>
            <div class="d-flex justify-content-center align-items-center">
                <div  id="${stream}-remove-condition-${index}" class="condition-mod icon" value="Remove"> 
                    <img src="/static/img/trash-bin.svg"  alt="">
                </div> 
                <div  id="${stream}-and-condition-${index}" class="condition-mod icon add-filter" value="And">
                    <img src="/static/img/plus-sign.svg"  alt="">
                </div>
            </div>
            
        </div>
    </div> 
    `
};

function chartSelectTemplate(){
    return `
    <div class="condition" id="${stream}-condition-${index}">
        <div class="d-flex justify-content-center align-items-center">
            <div class="field-condition sub-condition">
                <label for="${stream}-field-select-${index}">Field:</label><br>
                <select id="${stream}-field-select-${index}" class="field-select">
                    
                </select>
            </div>
        </div>
    </div>
`
};

function createOption(elementId, key, value){
    var o = document.createElement("option");
    o.value = key;
    o.innerHTML = value;
    document.getElementById(elementId).appendChild(o);
}

function valueIsInList(listId, value) {
    const listItems = document.querySelectorAll(`#${listId} li`);
    for (let i = 0; i < listItems.length; i++) {
      if (parseInt(listItems[i].getAttribute('value')) == value) {
        
        return true;
      }
    }
    return false;
  };

function addAvailableListItem(listId, value, text){
   let liHtml =   `
        <li value=${value}>
            ${text}
            <div class="condition-mod icon add-field" style="background-color: white;">
                    <img src="/static/img/plus-sign.svg"  alt="">
            </div>
            
        </li>
    `
    document.getElementById(listId).insertAdjacentHTML('beforeend', liHtml);
};

function addAvailableVariableListItem(listId, value, text){
    let liHtml =   `
         <li value=${value}>
             ${text}
             <div class="condition-mod icon add-variable" style="background-color: white;">
                     <img src="/static/img/plus-sign.svg"  alt="">
             </div>
             
         </li>
     `
     document.getElementById(listId).insertAdjacentHTML('beforeend', liHtml);
 };

function addSelectedListItem(listId, value, text){
    if (valueIsInList(listId, value)){  
        return 
    } else {
    let liHtml =   `
         <li value=${value}>
             ${studioFilterStructure["fields"][value].name}
             <div class="condition-mod icon remove-field" style="background-color: white;">
                     <img src="/static/img/trash-bin.svg"  alt="">
             </div>
             
         </li>
     `
     document.getElementById(listId).insertAdjacentHTML('beforeend', liHtml);
     
     window.selectedFields[value] = studioFilterStructure["fields"][value];
    }
 };
 function addSelectedVariableListItem(listId, value, text){

    if (valueIsInList(listId, value)){  
        return 
    } else {
        let liHtml, inputType, dValue;
        if ([3, 4].includes(parseInt(value)) ) {
            inputType = 'color';
        } else {
            inputType = 'text';
        }
        dValue = studioFilterStructure["variables"][value].defaultValue;
        liHtml =   `
         <li value=${value}>
             ${studioFilterStructure["variables"][value].name}
             <input type="${inputType}" id="fname" name="fname" value="${dValue}" style=" margin-left: auto;"><br><br>
             <div class="condition-mod icon remove-variable" style="background-color: white;">
                     <img src="/static/img/trash-bin.svg"  alt="">
             </div>
             
         </li>
     `
     document.getElementById(listId).insertAdjacentHTML('beforeend', liHtml);
     
     window.selectedVariables[value] = studioFilterStructure["variables"][value];
    }
 };

function fillFields(stream, index){
    
    let filt = filterStructure[stream];
    for (let field in filt){
        createOption(`${stream}-field-select-${index}`, field, field);
    }
};

function fillChartSelect(selectId, filterName){
    let filt = studioFilterStructure[filterName];
    for (let field in filt){
        
        createOption(`${selectId}`, field, filt[field].name);
    }
};
function fillFieldsList(listId, filterName){
    let filt = studioFilterStructure[filterName];
    for (let field in filt){
        
        addAvailableListItem(`${listId}`, field, filt[field].name);
    }
};
function fillVariablesList(listId, filterName){
    let filt = studioFilterStructure[filterName];
    for (let field in filt){
        
        addAvailableVariableListItem(`${listId}`, field, filt[field].name);
    }
};
function fillOperatorAndValue(stream, index){
    console.log("filling values")
    let selectedField = $(`#${stream}-field-select-${index}`).val();
    let operators = filterStructure[stream][selectedField]["operators"];
    let value = filterStructure[stream][selectedField]["value"];
    try { 
        document.querySelector(`#${stream}-value-condition-${index}`).destroy();
    } catch {
        console.log("err")
    }
    $(`#${stream}-operator-select-${index}`).html('');
    $(`#${stream}-value-condition-${index}`).html('');
    operators.forEach((o) => {
        createOption(`${stream}-operator-select-${index}`, o, o);
    });
    if (selectedField.toLowerCase() == 'topic') {
        //document.querySelector(`#${stream}-value-condition-${index}`).destroy()
        initTopicField(`#${stream}-value-condition-${index}`)
    } else {
        $(`#${stream}-value-condition-${index}`).append(
            `<select id="${stream}-value-select-${index}"></select>`)
    value.forEach((o) => {
            createOption(`${stream}-value-select-${index}`, o, o);
        }
    )}
};

String.prototype.format = function(params) {
    let str = this;
    for (let key in params) {
      str = str.replace(new RegExp(`{${key}}`, 'g'), params[key]);
    }
    return str;
  };


function fillForm(elementId){
    fillFields(elementId);
    fillOperatorAndValue(elementId);
}
function addCon(formId, logic=null){
    let stream = formId.split("-")[0];
    let i = window.conditionCounter[stream];
    let logicDiv;
    if (logic){
        logicDiv = `
            <div class="logic-container">
                <hr style="margin: 1px;">
                <div value="${logic}" class="logic" id="${stream}-logic-${i}">  ${logic}  </div>
                <hr style="margin: 1px">
            </div>`;
    } else {
        logicDiv = '';
    }
    let cond = conditionTemplate(i, stream, logicDiv);
    $(`#${formId}`).append(cond);
    fillFields(stream, i);
    fillOperatorAndValue(stream, i);
    window.conditionCounter[stream] += 1;
};

function addChartOption(formId){
    let stream = formId.split("-")[0];
    let i = window.conditionCounter[stream];
    
    let cond = conditionTemplate(i, stream, logicDiv);
    $(`#${formId}`).append(cond);
    fillFields(stream, i);
    window.conditionCounter[stream] += 1;
};

function removeValueFromArray(array, value) {
    return array.filter(function(item) {
      return item !== value;
    });
  };
$(document).on('click', '.add-field', function(){
    const liValue = $(this).closest('li').attr('value');
    const liText = studioFilterStructure['fields'][liValue];
    addSelectedListItem('selected-fields-list', liValue, liText);
});
$(document).on('click', '.remove-field', function(){
    const liValue = $(this).closest('li').attr('value');
    $(this).closest('li').remove();
    delete window.selectedFields[liValue];
    // window.selectedFields = removeValueFromArray(window.selectedFields, liValue)
});
$(document).on('click', '.add-variable', function(){
    const liValue = $(this).closest('li').attr('value');
    const liText = studioFilterStructure['fields'][liValue];
    addSelectedVariableListItem('selected-variables-list', liValue, liText);
});
$(document).on('click', '.remove-variable', function(){
    const liValue = $(this).closest('li').attr('value');
    $(this).closest('li').remove();
    delete window.selectedVariables[liValue];
    // window.selectedFields = removeValueFromArray(window.selectedFields, liValue)
});
$(document).on('change', '#chart-select', function(){
    window.selectedChart = parseInt($(this).val());
});
$(document).on('change', '.field-select', function (e) {
    let parts = $(this).attr('id').split('-');
    let stream = parts[0];
    let index = parts[parts.length - 1];
    fillOperatorAndValue(stream, index);
});
$(document).on('click', '.condition-mod', function(e){
    if ($(this).hasClass('add-field')) {
        return
    }
    
    let logic = $(this).attr('value');
    let parts = $(this).attr('id').split('-');
    let stream = parts[0];
    let index = parts[parts.length - 1];
    if (logic.toLowerCase() == 'remove'){
        let conditionNumber = $(`#${stream}-query-form .condition`).length;
        if (!(conditionNumber == 1)){

            $(`#${stream}-condition-${index}`).remove();
        } 
        if ($(`#${stream}-query-form .condition`).length == 1){
            $(`#${stream}-query-form .condition .logic-container`).remove();
        };
        $($(`#${stream}-query-form .condition`).first()).find('.logic-container').remove()

    } else { 
        addCon(`${stream}-query-form`, logic);
        
    }
});
$('.reset-button').on('click', async function (){
    let parts = $(this).attr('id').split('-');
    let stream = parts[0];
    //window.conditionCounter[stream] = 0;
    window.countryConditions[stream] =  [];
    // renderCharts();
    fillSearchBar(stream);
});
$('#studio-generate-query-button').on('click', function(){
   
    // ALARM:  aggiungere la country!!!
    
    // let parts = $(this).attr('id').split('-');
    // let stream = parts[0];
    let stream = 'studio' ;
    let conditions = $(`#${stream}-query-form .condition`);
    
    
    let payload = [];
    conditions.each(function() {
        let field = $($(this).find('.field-condition select')[0]).val();
        let operator = $($(this).find('.operator-condition select')[0]).val();
        let value;
        if (field.toLowerCase() == 'topic') {
            value = $($(this).find('.vscontainer')[0]).val();

        } else {
            value = $($(this).find('.value-condition select')[0]).val();
        }
        let logic = $(this).find('.logic');
        logic = logic.length > 0 ? $(logic).attr('value') : "";
        
        let selectedArray = Array.isArray(value) ? value : [value];
        selectedArray.forEach(v => 
            {
            payload.push(
                {
                    "field": field,
                    "operator": operator,
                    "value": v,
                    "logic": logic
                }
            )})
        })
    window.countryConditions[stream] = payload;
    fillSearchBar(stream);
    $('.builder-container').hide();
    $('#modal-overlay').hide();
});

function findCountryByCode(code) {
    return Object.values(window.countries).find(country => country.country_id == code);
}

function showMCPopup(evt) {
                  
    const fullText = $(this).find('.full-text').text();
    const topics = $(this).find('.detected-topics').text();
    let popup = $('#mc-story-popup');
    popup.find('.detected-topics span').text(`${topics}`);
    popup.find('.full-text span').text(`${fullText}`);
    
    popup.css({
      display: 'block',
      top: `${evt.clientY + window.scrollY}px`,
      left: `${evt.clientX + window.scrollX}px`
    });
  };

  function hideMCPopup() {
    $('#mc-story-popup').css('display', 'none');
  };

  function showTgPopup(evt) {
                  
    const fullText = $(this).find('.full-text').text();
    const topics = $(this).find('.detected-topics').text();
    let popup = $('#tg-message-popup');
    popup.find('.detected-topics span').text(`${topics}`);
    popup.find('.full-text span').text(`${fullText}`);
    
    popup.css({
      display: 'block',
      top: `${evt.clientY + window.scrollY}px`,
      left: `${evt.clientX + window.scrollX}px`
    });
  };

  function hideTgPopup() {
    $('#tg-message-popup').css('display', 'none');
  };

  function containsStream(objects, targetStream) {
    return objects.some(obj => obj.stream == targetStream);
}
$('#create-chart-button').on('click', function(){
    if (window.countryConditions['studio'].length == 0) {
        alert('Query empty. Select at least one field')
        return
    }
    if (Object.keys(window.selectedFields).length == 0) {
        alert('Select at least one field from Available Fields')
    }
    window.MessagesOffset = {"tg": 0, "mc": 0};
    if (containsStream(Object.values(window.selectedFields), 'tg')) {
        TgMessageWidget();
    } else {
        $(`#tg-messages`).html('');  
    }
    if (containsStream(Object.values(window.selectedFields), 'mc')) {
        MCStoryWidget();
    }  else {
        $(`#mc-stories`).html('');
    }

    let stream = 'studio';
    let start_date = $(`#${stream}-filter-bar .datepicker`).data(
        'daterangepicker').startDate.format('YYYYMMDD')

    let end_date = $(`#${stream}-filter-bar .datepicker`).data(
            'daterangepicker').endDate.format('YYYYMMDD')
    start_date = parseInt(start_date);
    end_date = parseInt(end_date);   

    let studio_endpoint = studioFilterStructure['charts'][window.selectedChart]['endpoint'];
    let studioQueryParams = $.param(
        {
            start_date: start_date,
            end_date: end_date,
            conditions: JSON.stringify(window.countryConditions[stream]),
            fields: JSON.stringify(Object.values(window.selectedFields)),
            countries: JSON.stringify(window.selectedCountries),
        },
        true
    );
    let studioUrl = studio_endpoint + '?' + studioQueryParams;
    // let resp = fetch(studioUrl);
    
    let customOptions = {};
    $('#selected-variables-list li').each(function() {
        
        if (parseInt($(this).attr('value')) == 3){ // background color
            window.chartBackground = $(this).find('input').val();
        } else if (parseInt($(this).attr('value')) == 4){  // text color
            window.chartTextColor = $(this).find('input').val();
        } 
            let value = studioFilterStructure['variables'][$(this).attr('value')]['value'];
            let input = $(this).find('input').val();
            customOptions[`${value}`] = input;
            console.log(customOptions)
        
    });
    
    // let customOptions = {titleText: 'Attention'};
    $(`#studio-chart`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    
    switch (window.selectedChart) {
        case 0:
            renderTimeSeriesFromUrl(
                'studio-chart', studioUrl, customOptions, 'date'
            );
            break;
        case 1:
            let mappingKeys = {'categoryKey': 'field', 'valueKey': 'frequency'};
            renderBarChartFromUrl('studio-chart', studioUrl, mappingKeys, customOptions);
            break;
        case 2:
            customOptions['chartType'] = 'column';
            renderTimeSeriesFromUrl(
                'studio-chart', studioUrl, customOptions, 'date'
            );
            break;
        default:
            console.log('Invalid chart selection');
    }
   
});

function truncate(str, n){
    return (str.length > n) ? str.slice(0, n-1) + '&hellip;' : str;
  };
function TgMessageCard(author, url, body, timestamp, topics){
    return `
    <div class='mc-card mt-4 mb-4'>
        <div class="mc-message mb-4 mt-2">
            <div class="mb-2 tg-msg-text">
                <span>${truncate(body, window.tgMessageMaxLen)}</span>
                <span style="display: none;" class='full-text'>${body}</span>
                <span style="display: none;" class='detected-topics'>${topics}</span>
            <a href="${url}" target="_blank" style="margin-left: 1rem;">
                <i class="fa fa-external-link" style="color: white;">
                </i>
            </a>
            </div>
        
        </div>
        <br>
        <div class="mc-story-meta d-flex justify-content-between flex-wrap">
            <div class="mc-author">${author.split("/").slice(-1)[0]}</div>
            <br>
            <div class="mc-timestamp">${timestamp.split(":").slice(0, -1).join(":")}</div>
        </div>
    </div>
    `
}

async function TgMessageWidget(){
    
    if (window.MessagesOffset["tg"] == 0) {
        $(`#tg-messages`).html('<div class="h-100 d-flex justify-content-center align-items-center"><div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div></div>');
    }
    let countries_list = window.selectedCountries
    let country_id = countries_list[0]
    let country = findCountryByCode(country_id).alpha_2.toLowerCase()

    
    let base_endpoint = `/tg_messages_from_many_countries`;
    let queryParams = $.param(
        {
            start_date: window.startDate,
            end_date: window.endDate,
            conditions: JSON.stringify(window.countryConditions["studio"]),
            sorted_by: 'date',
            limit: window.MessagesLimit["tg"],
            offset: window.MessagesOffset["tg"],
            countries: JSON.stringify(countries_list)
            
        },
        true
    );
    
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {};
    await fetch(url).then(
        response => response.json()
    ).then(data => {
        if (data.length == 0 && window.MessagesOffset["tg"] == 0) {
            $(`#tg-messages`).html(noDataHTMLSocial);
        } else {
            if (window.MessagesOffset["tg"] == 0) {
                $(`#tg-messages`).html('');
                $('#tg-messages').append(
                    `
                    <div class="table-container" id="scrollable-messages">
                        <div id="tg-messages-content">
                        </div>
                    </div>
                    `
                )
                $('#scrollable-messages').scroll(function() {
                    
                    if($(this).scrollTop() + $(this).innerHeight() >= $(this)[0].scrollHeight) {
                        window.MessagesOffset["tg"] += window.MessagesLimit["tg"];
                        TgMessageWidget();
                    }
                });
                
            }
            data.forEach(function(d) {
                let author_username = d.username ? d.username : '';
                let body = d.body ? d.body : '';
                let url = author_username + '/' + d.message_id.toString();
                $('#tg-messages-content').append(
                    TgMessageCard(author_username, url, body, d.timestamp, d.detected_topics)
                );
                $('#tg-messages-content').append(
                    '<div class="cards-separator"></div>'
                );
            
            });
            document.querySelectorAll('.tg-msg-text').forEach((s) => s.removeEventListener('mouseenter', showTgPopup) )
            document.querySelectorAll('.tg-msg-text').forEach((s) => s.removeEventListener('mouseleave', hideTgPopup) )
            document.querySelectorAll('.tg-msg-text').forEach((s) => s.addEventListener('mouseenter', showTgPopup) )
            document.querySelectorAll('.tg-msg-text').forEach((s) => s.addEventListener('mouseleave', hideTgPopup) )
            // reflowCharts();
        }
    })
};

function MCStoryCard(author, storyUrl, body, timestamp, topics){
    return `
    <div class='mc-card mt-4 mb-4'>
        <div class="mc-message mb-4 mt-2 mc-story-text">
            <a href="${storyUrl}" style="color: white;" class="link" target="_blank" rel="noopener noreferrer">${truncate(body, window.mcStoryMaxLen)}</a>
            <span style="display: none;" class='full-text'>${body}</span>
            <span style="display: none;" class='detected-topics'>${topics}</span>
        </div>
        <br>
        <div class="mc-story-meta d-flex justify-content-between">
            <div class="mc-author">${author}</div>
            <br>
            <div class="mc-timestamp">${timestamp.split("T")[0]}</div>
        </div>
    </div>
    `


}
async function MCStoryWidget(){
    let MAX_LEN = 300;
    if (window.MessagesOffset["mc"] == 0) {
        $(`#mc-stories`).html('<div class="h-100 d-flex justify-content-center align-items-center"><div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div></div>');
    }
    let countries = window.selectedCountries;
    let base_endpoint = `/mc_stories_from_many_countries`;
    let queryParams = $.param(
        {
            start_date: window.startDate,
            end_date: window.endDate,
            conditions: JSON.stringify(window.countryConditions["studio"]),
            sorted_by: 'date',
            limit: window.MessagesLimit["mc"],
            offset: window.MessagesOffset["mc"],
            countries: JSON.stringify(countries)
        },
        true
    );
    let url = base_endpoint + '?' + queryParams;
    let customOptions = {};
    await fetch(url).then(
        response => response.json()
    ).then(data => {
        if (data.length == 0 && window.MessagesOffset["mc"] == 0) {
            $(`#mc-stories`).html(noDataHTMLMedia);
        } else {
            if (window.MessagesOffset["mc"] == 0){
                $(`#mc-stories`).html('');
                $('#mc-stories').append(
                    `
                    <div class="table-container" id="scrollable-stories">
                        <div class="" id="mc-stories-content">
                        </div>
                    </div>
                    `)
                    $('#scrollable-stories').scroll(function() {
                        if($(this).scrollTop() + $(this).innerHeight() >= $(this)[0].scrollHeight) {
                            window.MessagesOffset["mc"] += window.MessagesLimit["mc"];
                            MCStoryWidget();
                        }
                    });
            }
            data.forEach(function(d) {
                let author_username = d.username ? d.username : '';
                let body = d.body ? d.body : '';
                let url = d.url ? d.url : '';
                
                $('#mc-stories-content').append(
                    MCStoryCard(author_username, url, body, d.timestamp, d.detected_topics)

                )
                $('#mc-stories-content').append(
                    '<div class="cards-separator"></div>'
                )
            
            });
            //$('.mc-story-text').off('hover');
            document.querySelectorAll('.mc-story-text').forEach((s) => s.removeEventListener('mouseenter', showMCPopup) )
            document.querySelectorAll('.mc-story-text').forEach((s) => s.removeEventListener('mouseleave', hideMCPopup) )
            document.querySelectorAll('.mc-story-text').forEach((s) => s.addEventListener('mouseenter', showMCPopup) )
            document.querySelectorAll('.mc-story-text').forEach((s) => s.addEventListener('mouseleave', hideMCPopup) )


            // reflowCharts();
        }
    })    

};
$(document).ready(async function (){
    document.querySelectorAll('.popup-trigger').forEach((s) => s.addEventListener('mouseenter', showInfoPopup) )
    document.querySelectorAll('.popup-trigger').forEach((s) => s.addEventListener('mouseleave', hideInfoPopup) )
    $('.form-open').on('click', function (){
        
        let formOpen = $(this).closest('.filter-bar');
        let position = formOpen.position();
        let height = formOpen.outerHeight();
        $(this).closest('.filter-top').closest('.filter-bar').find('.builder-container')
        .css({
            top: position.top + height  ,
            left: position.left ,
            width: $(this).width()
          })
          .toggle();
        
        $('#modal-overlay').toggle();
    });
    $('#modal-overlay').on('click', function() {
        $('.builder-container').hide();
        $(this).hide();
      });
    addCon('studio-query-form');
    fillChartSelect('chart-select', 'charts');
    fillFieldsList('available-fields-list', 'fields');
    initPicker('studio-filter-bar .datepicker');
    fillVariablesList('available-variables-list', 'variables');
})
