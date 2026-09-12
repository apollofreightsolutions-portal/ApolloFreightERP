(() => {
  const CLOUDINARY_CLOUD_NAME = window.APOLLO_CLOUDINARY_CLOUD_NAME || "wqvn6dc4";
  const CLOUDINARY_UPLOAD_PRESET = window.APOLLO_CLOUDINARY_UPLOAD_PRESET || "employee_portal_unsigned";
  const API_URL = (window.APOLLO_API_URL || window.location.origin).replace(/\/$/, "");
  const SESSION_KEY = "apollofreighterp-session";
  const PHOTO_TYPE = "Employee Photo";
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  function session() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function isMyProfile() {
    const title = document.querySelector("#pageTitle")?.textContent?.trim().toLowerCase() || "";
    const eyebrow = document.querySelector("#pageEyebrow")?.textContent?.trim().toLowerCase() || "";
    return title === "my profile" || eyebrow === "my profile";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function api(path, options = {}) {
    const current = session();
    const token = current?.token || "";
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await fetch(`${API_URL}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  async function uploadToCloudinary(file) {
    const body = new FormData();
    body.append("file", file);
    body.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    body.append("folder", "apollo-freight/employee-profiles");
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/image/upload`, {
      method: "POST",
      body
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.secure_url) {
      throw new Error(data.error?.message || "Cloudinary upload failed. Check the upload preset and Cloudinary settings.");
    }
    return data;
  }

  async function findPhotoDocument(userName) {
    const result = await api("/api/documents");
    return (result.rows || []).find((row) =>
      String(row.linked_no || "").toLowerCase() === String(userName || "").toLowerCase() &&
      String(row.type || "").toLowerCase() === PHOTO_TYPE.toLowerCase()
    ) || null;
  }

  async function savePhotoDocument(userName, cloudinary) {
    const existing = await findPhotoDocument(userName);
    const payload = {
      documentNo: existing?.document_no || `EMP-PHOTO-${String(userName || "employee").replace(/[^a-z0-9_-]/gi, "-")}`,
      linkedNo: userName,
      type: PHOTO_TYPE,
      status: "Uploaded",
      date: new Date().toISOString().slice(0, 10),
      owner: "HR",
      fileName: cloudinary.original_filename ? `${cloudinary.original_filename}.${cloudinary.format || "jpg"}` : "employee-profile-photo",
      storageUrl: cloudinary.secure_url,
      notes: JSON.stringify({ publicId: cloudinary.public_id || "", resourceType: cloudinary.resource_type || "image" })
    };

    if (existing) {
      return api(`/api/documents/${encodeURIComponent(existing.document_no)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    }

    return api("/api/documents", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  function removeExistingCard() {
    document.querySelectorAll("[data-hr-photo-card]").forEach((node) => node.remove());
  }

  function renderCard(photoUrl, userName) {
    const moduleContent = document.querySelector("#moduleContent");
    if (!moduleContent || !isMyProfile()) return;
    removeExistingCard();

    const card = document.createElement("section");
    card.className = "module-card hr-profile-photo-card";
    card.dataset.hrPhotoCard = "true";
    card.style.marginBottom = "16px";
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
        <div style="width:96px;height:96px;border-radius:50%;overflow:hidden;border:1px solid #d9e1ea;background:#f4f7fa;display:flex;align-items:center;justify-content:center;flex:0 0 auto">
          ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="Employee profile photo" style="width:100%;height:100%;object-fit:cover" />` : `<span style="font-size:30px">👤</span>`}
        </div>
        <div style="flex:1;min-width:220px">
          <p class="eyebrow" style="margin:0 0 5px">Employee Profile Photo</p>
          <h3 style="margin:0 0 6px">${photoUrl ? "Profile photo uploaded" : "No profile photo"}</h3>
          <p style="margin:0;color:#667085">JPG, JPEG or PNG • Maximum 5 MB</p>
        </div>
        <div>
          <input id="hrProfilePhotoInput" type="file" accept="image/jpeg,image/png" hidden />
          <button id="hrProfilePhotoButton" type="button" class="blue-button">${photoUrl ? "Change Photo" : "Upload Photo"}</button>
          <p id="hrProfilePhotoMessage" class="form-message" role="status" style="margin-top:8px"></p>
        </div>
      </div>`;

    moduleContent.prepend(card);
    const input = card.querySelector("#hrProfilePhotoInput");
    const button = card.querySelector("#hrProfilePhotoButton");
    const message = card.querySelector("#hrProfilePhotoMessage");
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!/^image\/(jpeg|png)$/.test(file.type)) {
        message.textContent = "Please select a JPG, JPEG, or PNG image.";
        input.value = "";
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        message.textContent = "Photo must be 5 MB or smaller.";
        input.value = "";
        return;
      }

      const current = session();
      if (!current?.userName) {
        message.textContent = "Please log in again before uploading your photo.";
        return;
      }

      button.disabled = true;
      message.textContent = "Uploading photo...";
      try {
        const cloudinary = await uploadToCloudinary(file);
        await savePhotoDocument(current.userName, cloudinary);
        message.textContent = "Photo uploaded successfully.";
        renderCard(cloudinary.secure_url, current.userName);
      } catch (error) {
        message.textContent = error.message || "Photo upload failed.";
        button.disabled = false;
      }
    });
  }

  async function refresh() {
    if (!isMyProfile()) return;
    const current = session();
    if (!current?.userName) return;
    try {
      const photo = await findPhotoDocument(current.userName);
      renderCard(photo?.storage_url || "", current.userName);
    } catch (error) {
      console.warn("HR profile photo could not be loaded:", error);
      renderCard("", current.userName);
    }
  }

  let timer = null;
  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  }

  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", scheduleRefresh);
  scheduleRefresh();
})();
