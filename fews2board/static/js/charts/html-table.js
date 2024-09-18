
/**
 * HTMLTable.js - A JavaScript module for generating customizable HTML tables.
 * This module exports a function to render HTML tables dynamically based on provided data and user-defined settings.
 *
 * @param {string} tableId - The DOM element ID where the table will be rendered.
 * @param {Array<Object>} data - The dataset for the table in JSON format. Each object should have properties matching the column headers.
 * @param {Object} customOptions - Optional settings to override default table options. Provides full customization capability for the table appearance and behavior.
 * Available options include styling, captions, and more. These options are merged with the default settings provided within the function.
 *
 * Usage Example:
 * renderHTMLTable('table-container', tableData, { titleText: 'My Data Table', tableClass: 'striped-table' });
 *
 */

export function renderHTMLTable(tableId, data, customOptions) {
	const defaultOptions = {
		titleText: '',
		headerRow: true, // Option to include a header row
		columnStyles: {}, // { columnName: 'style-string', ...}
		// ... Add more default options as desired
	};

	const options = { ...defaultOptions, ...customOptions };

	const uniqueHeaders = new Set();
	for (const row of data) {
		for (const key in row) {
			uniqueHeaders.add(key);
		}
	}
	// Generate table HTML structure
	let htmlTable = '<table class="tp-table">';

	// Caption
	if (options.titleText) {
		htmlTable += `<caption>${options.titleText}</caption>`;
	}

	// Header row
	if (options.headerRow) {
		htmlTable += '<thead><tr>';
		for (const header of uniqueHeaders) {
			htmlTable += `<th>${header}</th>`;
		}
		htmlTable += '</tr></thead>';
	}

	// Table body
	htmlTable += '<tbody>';
	for (const row of data) {
		htmlTable += '<tr>';
		// Fill in data cells even if some data is missing for a row
		for (const header of uniqueHeaders) {
		const value = row[header] ? row[header] : '';
		htmlTable += `<td>${value}</td>`;
		}
		htmlTable += '</tr>';
	}
	htmlTable += '</tbody>';

	htmlTable += '</table>';

	// Render the table
	const tableContainer = document.getElementById(tableId);
	tableContainer.innerHTML = htmlTable;
}

export async function renderHTMLTableFromUrl(tableId, url, columnsMapping, customOptions){
    await fetch(url).then(
        response => response.json()
    ).then(data => {
        let filterData = data.map(function(item) {
            var filterRow = {};
            // Itera sulle chiavi dell'oggetto originale
            Object.keys(item).forEach(function(key) {
                // Controlla se la chiave è presente nella mappatura
                if (keysMapping.hasOwnProperty(key)) {
                    // Assegna il valore dell'oggetto originale alla nuova chiave
                    filterData[keysMapping[key]] = item[key];
                }
            });
            return filterRow;
        });
        renderHTMLTable(tableId, filterData, customOptions)
    })
};