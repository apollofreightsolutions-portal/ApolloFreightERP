const XLSX = require('xlsx');

// Reads values and cached formula results only. Never loads or runs VBA.
// Called only after spreadsheetText has validated the container and size limits.
function extractSpreadsheetInvoice(file) {
  const book = XLSX.read(Buffer.from(file.contentBase64, 'base64'), {
    type: 'buffer', cellFormula: false, cellHTML: false, bookVBA: false
  });
  const lines = [];
  const shipment = {};
  let unrecognized = false;
  const label = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const name of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(book.Sheets[name], {header: 1, raw: false, defval: '', blankrows: true});
    let columns = null, found = false;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const labels = row.map(label);
      const desc = labels.findIndex(s => /^(description|itemdescription|descriptionofgoods|goodsdescription|productdescription)$/.test(s));
      const codes = labels.map((s, i) => /^(?:\d+digit)?(?:hscode|hscodes|hstariffcode|tariffcode)(?:\d+digit)?$/.test(s) ? i : -1).filter(i => i >= 0);
      if (desc >= 0 && codes.length) {
        columns = {desc, codes: codes.sort((a,b) => Number(labels[b].includes('12digit')) - Number(labels[a].includes('12digit'))),
          qty: labels.findIndex(s => /^(qty|quantity|pieces|pcs)$/.test(s)),
          unit: labels.findIndex(s => /^(unit|uom)$/.test(s))};
        found = true;
        continue;
      }
      if (columns) {
        const description = String(row[columns.desc] || '').trim();
        const hsCode = String(columns.codes.map(i => row[i]).find(v => String(v || '').trim()) || '').trim();
        if ((description || hsCode) && !/^(?:sub\s*total|grand\s*total|total)(?:\s|:|$)/i.test(description)) {
          lines.push({description, hsCode, quantity: Number(String(row[columns.qty] || '').replace(/,/g, '')) || 0,
            unit: row[columns.unit] || '', sourceFile: file.fileName, sourceSheet: name, sourceRow: rowIndex + 1});
        }
      }
      for (const cell of row) {
        const text = String(cell || '').trim();
        const invoice = text.match(/^invoice\s*(?:no\.?|number|#)\s*:?\s*(\S+)/i);
        if (invoice) shipment.invoiceNo = invoice[1];
        const weight = text.match(/^total\s+gross\s+weight\s*:?\s*([\d,.]+)\s*kgs?\b/i);
        if (weight) shipment.grossWeightKg = Number(weight[1].replace(/,/g, ''));
      }
    }
    // Unknown sheets may contain additional invoice lines: use document AI instead
    // of silently ignoring them or returning a partial green result.
    if (!found && rows.some(r => r.some(v => String(v).trim()))) unrecognized = true;
  }
  if (!lines.length || unrecognized) return null;
  return {lineItems: lines, shipment, cargoLines: [], warnings: [
    'Excel invoice rows were read directly. Verify shipment, packing and dimension fields before booking; missing fields were not inferred.'
  ]};
}

module.exports = {extractSpreadsheetInvoice};
