/* Apollo Freight Solutions Portal - Customer Portal HS Code lookup enhancement.
   This file intentionally works as a standalone module so it can be added without rewriting
   the large generated app-runtime.js bundle. */
const HS_MASTER_URL = "./hs-code-master.json";
let hsMasterPromise = null;
let hsMaster = [];

function hsToken() {
  try {
    const raw = sessionStorage.getItem("apollofreighterp-session");
    const session = raw ? JSON.parse(raw) : null;
    return session?.portal === "customer" ? String(session.token || "") : "";
  } catch {
    return "";
  }
}

function normalizeHsText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function loadHsMaster() {
  if (hsMaster.length) return hsMaster;
  if (!hsMasterPromise) {
    hsMasterPromise = fetch(HS_MASTER_URL, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`HS master could not be loaded (${response.status}).`);
        return response.json();
      })
      .then((rows) => {
        hsMaster = Array.isArray(rows) ? rows : [];
        return hsMaster;
      })
      .catch((error) => {
        hsMasterPromise = null;
        throw error;
      });
  }
  return hsMasterPromise;
}

function hsSearch(rows, query) {
  const q = normalizeHsText(query);
  if (!q) return [];
  const words = q.split(" ").filter(Boolean);
  return rows
    .map((row) => {
      const code = normalizeHsText(row.hsCode);
      const en = normalizeHsText(row.itemNameEn);
      const ar = normalizeHsText(row.itemNameAr);
      const short = normalizeHsText(row.shortDescription);
      const headingEn = normalizeHsText(row.headingNameEn);
      const headingAr = normalizeHsText(row.headingNameAr);
      const haystack = `${code} ${en} ${ar} ${short} ${headingEn} ${headingAr}`;
      const allWords = words.every((word) => haystack.includes(word));
      if (!allWords) return null;

      let score = 0;
      if (code === q) score += 1000;
      if (en === q) score += 900;
      if (ar === q) score += 850;
      if (code.startsWith(q)) score += 700;
      if (en.startsWith(q)) score += 600;
      if (ar.startsWith(q)) score += 550;
      if (short.startsWith(q)) score += 450;
      score += words.reduce((sum, word) => sum + (haystack.includes(word) ? 5 : 0), 0);
      return { row, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || String(a.row.hsCode).localeCompare(String(b.row.hsCode)))
    .slice(0, 25)
    .map((item) => item.row);
}

function hsStyleOnce() {
  if (document.getElementById("apolloHsLookupStyle")) return;
  const style = document.createElement("style");
  style.id = "apolloHsLookupStyle";
  style.textContent = `
    .apollo-hs-field-wrap { position: relative; }
    .apollo-hs-results {
      position: absolute; z-index: 10050; left: 0; right: 0; top: calc(100% + 4px);
      max-height: 360px; overflow: auto; background: #fff; border: 1px solid #cbd5e1;
      border-radius: 10px; box-shadow: 0 16px 38px rgba(15,23,42,.16); padding: 5px;
    }
    .apollo-hs-result {
      width: 100%; border: 0; background: #fff; color: #172033; text-align: left;
      padding: 10px 11px; border-radius: 7px; cursor: pointer; display: block;
    }
    .apollo-hs-result:hover, .apollo-hs-result:focus { background: #f4f7fb; outline: none; }
    .apollo-hs-code { font-weight: 800; margin-right: 8px; }
    .apollo-hs-name { font-weight: 700; }
    .apollo-hs-ar { display:block; color:#64748b; margin-top:3px; font-size:12px; }
    .apollo-hs-meta { display:block; color:#64748b; margin-top:5px; font-size:11px; }
    .apollo-hs-info {
      margin-top: 8px; padding: 10px 12px; border: 1px solid #dbe3ec; border-radius: 8px;
      background: #f8fafc; font-size: 12px; line-height: 1.5;
    }
    .apollo-hs-info strong { color:#172033; }
    .apollo-hs-error { color:#b42318; font-size:12px; margin-top:6px; }
    .apollo-hs-history-code { font-weight:800; white-space:nowrap; }
  `;
  document.head.appendChild(style);
}

function hsInfoMarkup(row) {
  if (!row) return "";
  const details = [
    row.itemNameAr ? `<div><strong>Arabic:</strong> ${escapeHtmlSafe(row.itemNameAr)}</div>` : "",
    row.shortDescription ? `<div><strong>Description:</strong> ${escapeHtmlSafe(row.shortDescription)}</div>` : "",
    row.unit ? `<div><strong>Unit:</strong> ${escapeHtmlSafe(row.unit)}</div>` : "",
    row.duty ? `<div><strong>Duty:</strong> ${escapeHtmlSafe(row.duty)}</div>` : ""
  ].filter(Boolean).join("");
  return details ? `<div class="apollo-hs-info">${details}</div>` : "";
}

function escapeHtmlSafe(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function closeHsResults() {
  document.querySelectorAll(".apollo-hs-results").forEach((node) => node.remove());
}

function findHsRowByName(value) {
  const q = normalizeHsText(value);
  if (!q) return null;
  return hsMaster.find((row) =>
    normalizeHsText(row.itemNameEn) === q ||
    normalizeHsText(row.itemNameAr) === q ||
    normalizeHsText(row.hsCode) === q
  ) || null;
}

function setHsSelection(form, row) {
  if (!row) return;
  const itemField = form.querySelector("[name='itemName']");
  const hsField = form.querySelector("[name='hsCode']");
  const itemCodeField = form.querySelector("[name='itemCode']");
  if (itemField) itemField.value = row.itemNameEn || row.itemNameAr || "";
  if (hsField) hsField.value = row.hsCode || "";
  if (itemCodeField) itemCodeField.value = row.hsCode || "";
  if (itemField) {
    itemField.dataset.hsSelected = "1";
    itemField.dataset.hsCode = row.hsCode || "";
  }
  if (hsField) hsField.dataset.hsSelected = "1";
  const existing = form.querySelector(".apollo-hs-info");
  if (existing) existing.outerHTML = hsInfoMarkup(row);
}

async function enhanceHsForm(form) {
  if (!form || form.dataset.apolloHsReady === "1") return;
  if (form.dataset.form !== "customer-shipment-request") return;
  const itemField = form.querySelector("[name='itemName']");
  const hsField = form.querySelector("[name='hsCode']");
  const itemCodeField = form.querySelector("[name='itemCode']");
  if (!itemField || !hsField || !itemCodeField) return;

  form.dataset.apolloHsReady = "1";
  hsStyleOnce();

  const label = itemField.closest("label");
  const wrapper = document.createElement("div");
  wrapper.className = "apollo-hs-field-wrap";
  label?.parentNode?.insertBefore(wrapper, label);
  if (label) wrapper.appendChild(label);
  const datalist = itemField.list;
  if (datalist) datalist.removeAttribute("id");

  const results = document.createElement("div");
  results.className = "apollo-hs-results";
  results.hidden = true;
  wrapper.appendChild(results);

  const info = document.createElement("div");
  info.className = "apollo-hs-info";
  info.hidden = true;
  wrapper.appendChild(info);

  let requestSerial = 0;
  const renderResults = (rows) => {
    results.innerHTML = rows.length ? rows.map((row, index) => `
      <button type="button" class="apollo-hs-result" data-hs-index="${index}">
        <span><span class="apollo-hs-code">${escapeHtmlSafe(row.hsCode)}</span><span class="apollo-hs-name">${escapeHtmlSafe(row.itemNameEn || row.itemNameAr)}</span></span>
        ${row.itemNameAr ? `<span class="apollo-hs-ar">${escapeHtmlSafe(row.itemNameAr)}</span>` : ""}
        <span class="apollo-hs-meta">${row.unit ? `Unit: ${escapeHtmlSafe(row.unit)} | ` : ""}${row.duty ? `Duty: ${escapeHtmlSafe(row.duty)}` : ""}</span>
      </button>
    `).join("") : `<div class="apollo-hs-error">No HS code found. Try another item name or HS code.</div>`;
    results.hidden = false;
  };

  itemField.addEventListener("input", async () => {
    itemField.dataset.hsSelected = "0";
    hsField.value = "";
    itemCodeField.value = "";
    info.hidden = true;
    const query = itemField.value.trim();
    if (!query) {
      results.hidden = true;
      results.innerHTML = "";
      return;
    }
    const serial = ++requestSerial;
    try {
      const rows = hsSearch(await loadHsMaster(), query);
      if (serial !== requestSerial) return;
      renderResults(rows);
    } catch (error) {
      if (serial !== requestSerial) return;
      results.innerHTML = `<div class="apollo-hs-error">${escapeHtmlSafe(error.message || "HS master could not be loaded.")}</div>`;
      results.hidden = false;
    }
  });

  itemField.addEventListener("focus", async () => {
    if (!itemField.value.trim()) return;
    try {
      renderResults(hsSearch(await loadHsMaster(), itemField.value.trim()));
    } catch {}
  });

  results.addEventListener("click", (event) => {
    const button = event.target.closest("[data-hs-index]");
    if (!button) return;
    const rows = hsSearch(hsMaster, itemField.value.trim());
    const row = rows[Number(button.dataset.hsIndex)];
    if (!row) return;
    setHsSelection(form, row);
    info.hidden = false;
    info.innerHTML = hsInfoMarkup(row).replace(/^<div class="apollo-hs-info">|<\/div>$/g, "");
    results.hidden = true;
    results.innerHTML = "";
    itemField.dispatchEvent(new Event("change", { bubbles: true }));
  });

  itemField.addEventListener("blur", () => {
    window.setTimeout(() => {
      closeHsResults();
    }, 180);
  });

  // A selected result fills the HS fields automatically.  If no result is available, the
  // existing booking flow still allows submission so the Apollo team can review the item.

  // Preselect an already saved request if the form is opened with existing values.
  const existing = findHsRowByName(itemField.value);
  if (existing && hsField.value) {
    setHsSelection(form, existing);
    info.hidden = false;
    info.innerHTML = hsInfoMarkup(existing).replace(/^<div class="apollo-hs-info">|<\/div>$/g, "");
  }
}

function enhanceCustomerRequestTables() {
  const title = document.querySelector("#pageTitle")?.textContent?.trim() || "";
  if (!["Customer Dashboard", "Customer Shipments"].includes(title)) return;
  document.querySelectorAll("#moduleContent table").forEach((table) => {
    if (table.dataset.apolloHsHistoryReady === "1") return;
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim().toLowerCase());
    if (headers.includes("hs code")) return;
    const itemIndex = headers.findIndex((value) => value === "item");
    if (itemIndex < 0) return;
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    const masterMap = new Map(hsMaster.map((row) => [normalizeHsText(row.itemNameEn), row]));
    const headerRow = table.querySelector("thead tr");
    const newHeader = document.createElement("th");
    newHeader.textContent = "HS Code";
    headerRow?.insertBefore(newHeader, headerRow.children[itemIndex + 1] || null);
    rows.forEach((tr) => {
      const cells = tr.children;
      if (!cells[itemIndex]) return;
      const itemText = normalizeHsText(cells[itemIndex].textContent);
      const row = masterMap.get(itemText);
      const td = document.createElement("td");
      td.innerHTML = row ? `<span class="apollo-hs-history-code">${escapeHtmlSafe(row.hsCode)}</span>` : "—";
      tr.insertBefore(td, cells[itemIndex + 1] || null);
    });
    table.dataset.apolloHsHistoryReady = "1";
  });
}

function enhanceCustomerPortal() {
  const session = hsToken();
  if (!session) return;
  const form = document.querySelector("form[data-form='customer-shipment-request']");
  if (form) enhanceHsForm(form);
  if (!hsMaster.length) {
    loadHsMaster().then(() => enhanceCustomerRequestTables()).catch(() => {});
  } else {
    enhanceCustomerRequestTables();
  }
}

function bootHsEnhancement() {
  hsStyleOnce();
  const observer = new MutationObserver(() => {
    window.setTimeout(enhanceCustomerPortal, 0);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(enhanceCustomerPortal, 50);
}

bootHsEnhancement();
