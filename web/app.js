import "./shipment-reporting.js?v=apollo-v292-20261027";
import "./app-runtime.js?v=apollo-v32-awb-parity-20261107";
import "./hr-workflow-links.js?v=apollo-v241-notify-20261016-1";

import("./hr-portal.js?v=apollo-v241-notify-20261016-1").catch((error) => {
  console.warn("HR Leave Portal is unavailable.", error);
});

// HS lookup is an optional Customer Portal enhancement.  Load it after the core
// ERP has started so a missing static asset can never prevent login or buttons.
import("./hs-code-customer-portal.js?v=apollo-v30-20261104").catch((error) => {
  console.warn("Customer HS-code lookup is unavailable.", error);
});


import("./crm-portal.js?v=apollo-v29-accounts-20261026").catch((error) => {
  console.warn("CRM Portal is unavailable.", error);
});

import("./crm-assignment-links.js?v=apollo-v29-accounts-20261026").catch(error=>console.warn('CRM assignment link unavailable',error));

import("./apollo-ai.js?v=apollo-v32-20261106").catch((error) => {
  console.warn("Apollo AI is unavailable.", error);
});


import("./connected-chat.js").catch((error) => {
  console.warn("Connected Chat is unavailable.", error);
});
import("./customer-compliance.js?v=apollo-v32-20261106").catch((error) => {
  console.warn("Customer Compliance is unavailable.", error);
});
import('./customer-hs-help.js?v=apollo-v30-20261104').catch(error=>console.warn('HS help unavailable',error));
