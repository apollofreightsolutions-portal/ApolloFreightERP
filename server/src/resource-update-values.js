'use strict';

const CLEARABLE_UPDATE_FIELDS = Object.freeze({
  shipments: new Set(['airway_bill_no', 'tariff_no', 'shipment_service_other']),
  shipment_status_history: new Set(['notes']),
  consolidations: new Set(),
  customers: new Set(['location_or_lane', 'full_address', 'email', 'mobile', 'terms', 'notes']),
  suppliers: new Set(['location_or_lane', 'full_address', 'email', 'mobile', 'terms', 'notes']),
  invoices: new Set(['tariff_no', 'tariff_name', 'notes']),
  quotations: new Set(['customer_contact_person', 'customer_mobile', 'customer_email', 'nature_of_goods', 'notes']),
  shipment_requests: new Set(['hs_code', 'item_code', 'remarks', 'approval_notes']),
  additional_charges: new Set(['supplier', 'reference_no', 'invoice_no', 'remarks', 'attachment_name', 'approval_notes']),
  shipment_cargo_items: new Set(['remarks']),
  app_users: new Set(['notes']),
  employees: new Set(['department', 'designation', 'phone', 'personal_email', 'nationality', 'civil_id_no', 'passport_no', 'current_address', 'permanent_address', 'emergency_contact_name', 'emergency_contact_phone', 'notes'])
});
const NO_CLEARABLE_FIELDS = new Set();

function valueFromBody(body, item) {
  for (const name of item.names) {
    if (Object.prototype.hasOwnProperty.call(body, name)) return body[name];
  }
  return undefined;
}

function collectValues(config, body, includeKey = true, allowEmptyFields = NO_CLEARABLE_FIELDS) {
  const columns = [];
  const values = [];
  const clearable = allowEmptyFields || NO_CLEARABLE_FIELDS;

  for (const item of config.fields) {
    if (!includeKey && item.column === config.key) continue;
    const value = valueFromBody(body || {}, item);
    if (value === undefined || (value === '' && !clearable.has(item.column))) continue;
    columns.push(item.column);
    values.push(value);
  }

  return { columns, values };
}

module.exports = { CLEARABLE_UPDATE_FIELDS, collectValues };
