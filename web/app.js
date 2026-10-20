import "./app-runtime.js?v=apollo-v26-crm-excel-20261020";
import "./hr-workflow-links.js?v=apollo-v241-notify-20261016-1";

import("./hr-portal.js?v=apollo-v241-notify-20261016-1").catch((error) => {
  console.warn("HR Leave Portal is unavailable.", error);
});

// HS lookup is an optional Customer Portal enhancement.  Load it after the core
// ERP has started so a missing static asset can never prevent login or buttons.
import("./hs-code-customer-portal.js").catch((error) => {
  console.warn("Customer HS-code lookup is unavailable.", error);
});


import("./crm-portal.js?v=apollo-v26-crm-excel-20261020").catch((error) => {
  console.warn("CRM Portal is unavailable.", error);
});

import("./apollo-ai.js").catch((error) => {
  console.warn("Apollo AI is unavailable.", error);
});


import("./connected-chat.js").catch((error) => {
  console.warn("Connected Chat is unavailable.", error);
});
import("./customer-compliance.js?v=apollo-v26-crm-excel-20261020").catch((error) => {
  console.warn("Customer Compliance is unavailable.", error);
});
