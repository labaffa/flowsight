import { filterStructure, studioFilterStructure } from "./menu-module.js";
import { renderBarChart, renderBarChartFromUrl } from "./charts/bar-chart-module.js";
import { processChartData, renderLineChart, renderLineChartFromUrl } from "./charts/line-chart-module.js";
import { renderWordCloud } from "./charts/wordcloud-module.js";

Highcharts.setOptions({
	chart: {
		styledMode: true,
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
window.selectedCountries = [];
window.selectedFields = {};
window.selectedVariables = {};

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

  function initCountrySelect(eleId){
    const a = [];
    Object.values(window.countries).forEach( t => {
        if (window.fews_countries.includes(t.alpha_2.toLowerCase())) {
        a.push({"label": t.name, "value": t.country_id})
        }
    })
    
    // placeHolder = `-- ${placeHolder} [${options.length}] --`
    VirtualSelect.init({
      ele: eleId,
      options: a.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase())),
      multiple: true,
      search: false,
      disableSelectAll: true,
      showSelectedOptionsFirst: true,
      placeholder: 'Select country...'
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
    let liHtml =   `
         <li value=${value}>
             ${studioFilterStructure["variables"][value].name}
             <input type="text" id="fname" name="fname" style=" margin-left: auto;"><br><br>
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
$(document).on('change', '#country-select', function(){
    window.selectedCountries = $(this).val();
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


$('#create-chart-button').on('click', function(){
    if (window.selectedCountries.length == 0) {
        alert('Select at least one country from dropdown menu')
        return
    }
    if (window.countryConditions['studio'].length == 0) {
        alert('Query empty. Select at least one field')
        return
    }
    if (Object.keys(window.selectedFields).length == 0) {
        alert('Select at least one field from Available Fields')
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
        let value = studioFilterStructure['variables'][$(this).attr('value')]['value'];
        let input = $(this).find('input').val();
        customOptions[`${value}`] = input;
    });
    // let customOptions = {titleText: 'Attention'};
    $(`#studio-chart`).html('<div class="spinner-border country-chart-spinner" role="status"><span class="visually-hidden">Loading...</span></div>');
    if (window.selectedChart == 0) {
        renderLineChartFromUrl(
            `studio-chart`, studioUrl, customOptions, 'date'
        )
    } else if (window.selectedChart == 1){
        let mappingKeys = {'categoryKey': 'field', 'valueKey': 'frequency'};
        renderBarChartFromUrl('studio-chart', studioUrl, mappingKeys, customOptions)
    }
});

$(document).ready(async function (){
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
    initCountrySelect('#country-select');
    fillVariablesList('available-variables-list', 'variables');
})