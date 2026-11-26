// Uses the same Supabase project URL and anon key as script.js.
const SUPABASE_URL = "https://jpehecxayzttovrdjsbd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_2cIb-WGMArfeoc2OcQuO9w_pNDMxAMX";
const ready = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
const db = ready ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let newsletterSubscribers = [];

function feedback(id,msg,error=false){
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("error",error);
}

async function requireAdmin(user){
  if(!user){
    $("#adminLogin").classList.remove("hidden");
    $("#adminDashboard").classList.add("hidden");
    return false;
  }
  const {data,error}=await db.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(error||!data){
    await db.auth.signOut();
    $("#adminLogin").classList.remove("hidden");
    $("#adminDashboard").classList.add("hidden");
    feedback("#adminLoginFeedback","This account is not authorized to access the Postmaster's Office.",true);
    return false;
  }
  $("#adminLogin").classList.add("hidden");
  $("#adminDashboard").classList.remove("hidden");
  $("#adminEmail").textContent=user.email;
  await loadDashboard();
  return true;
}

async function loadDashboard(){
  const [subs,msgs]=await Promise.all([
    db.from("newsletter_subscribers").select("*",{count:"exact",head:true}),
    db.from("fan_messages").select("*",{count:"exact",head:true})
  ]);
  $("#subscriberCount").textContent=subs.count ?? "—";
  $("#messageCount").textContent=msgs.count ?? "—";
  $("#memberCount").textContent=subs.count ?? "—";
  const { count: eligibleRecipients } = await db
  .from("newsletter_subscribers")
  .select("*", { count: "exact", head: true })
  .eq("consent", true);

$("#broadcastRecipientCount").textContent = eligibleRecipients ?? "—";
  const {data:subscribers,error}=await db.from("newsletter_subscribers").select("name,email,created_at").order("created_at",{ascending:false}).limit(5000);
  newsletterSubscribers = subscribers || [];
  $("#subscribersTable").innerHTML=error
    ? '<tr><td colspan="3">Could not load subscribers.</td></tr>'
    : (subscribers?.length
      ? subscribers.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.email)}</td><td>${new Date(s.created_at).toLocaleDateString()}</td></tr>`).join("")
      : '<tr><td colspan="3">No subscribers yet.</td></tr>');
  $("#exportSubscribers").onclick=()=>downloadCSV(newsletterSubscribers);

  
  await loadFanMessages();

  await Promise.all([
  loadPublicLetters(),
  loadMemberDeliveries(),
  loadMusicDeliveries(),
  loadLatestRelease()
]);

}


async function loadFanMessages() {
  const container = $("#fanMessages");

  const { data: messages, error } = await db
    .from("fan_messages")
    .select("id,name,email,message,created_at,replied_at")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    container.textContent = "Could not load fan letters: " + error.message;
    return;
  }

  container.innerHTML = messages?.length
    ? messages.map(m => `
        <article class="fan-message" data-id="${esc(m.id)}">
          <header>
            <strong>${esc(m.name)}</strong>
            <span>${new Date(m.created_at).toLocaleString()}</span>
          </header>

          <small>${esc(m.email)}</small>

          <span class="fan-status ${m.replied_at ? "replied" : ""}">
            ${m.replied_at ? "Replied" : "Awaiting reply"}
          </span>

          <p class="fan-original-message">${esc(m.message)}</p>

          <div class="fan-actions">
            <button type="button" class="button button-purple reply-fan"
              data-id="${esc(m.id)}">Reply</button>

            <button type="button" class="button button-soft edit-fan"
              data-id="${esc(m.id)}">Edit</button>

            <button type="button" class="button delete-record delete-fan"
              data-id="${esc(m.id)}">Delete</button>
          </div>

          <form class="fan-reply-form hidden" data-id="${esc(m.id)}">
            <label>To
              <input type="email" value="${esc(m.email)}" readonly>
            </label>

            <label>Subject
              <input name="subject" maxlength="160"
                value="A personal reply from De Mailer" required>
            </label>

            <label>Your reply
              <textarea name="message" rows="5" maxlength="10000"
                placeholder="Write your reply..." required></textarea>
            </label>

            <div class="record-actions">
              <button type="submit" class="button button-purple">
                Send reply
              </button>
              <button type="button" class="button button-soft cancel-fan">
                Cancel
              </button>
            </div>
          </form>

          <form class="fan-edit-form hidden" data-id="${esc(m.id)}">
            <label>Name
              <input name="name" value="${esc(m.name)}" required>
            </label>

            <label>Email
              <input name="email" type="email" value="${esc(m.email)}" required>
            </label>

            <label>Fan letter
              <textarea name="message" rows="5" required>${esc(m.message)}</textarea>
            </label>

            <div class="record-actions">
              <button type="submit" class="button button-purple">
                Save changes
              </button>
              <button type="button" class="button button-soft cancel-fan">
                Cancel
              </button>
            </div>
          </form>

          <p class="fan-feedback" aria-live="polite"></p>
        </article>
      `).join("")
    : '<p class="empty-admin">No fan letters yet.</p>';
}


// Fan letter management actions.

$("#clearFanMessages").addEventListener("click", async () => {
  const confirmed = confirm(
    "This will permanently delete ALL fan letters. This cannot be undone. Continue?"
  );

  if (!confirmed) return;

  const secondConfirmation = prompt(
    'Type CLEAR ALL to confirm permanent deletion.'
  );

  if (secondConfirmation !== "CLEAR ALL") {
    alert("Clear All cancelled.");
    return;
  }

  const button = $("#clearFanMessages");
  button.disabled = true;
  button.textContent = "Clearing...";

  const { error } = await db
    .from("fan_messages")
    .delete()
    .not("id", "is", null);

  if (error) {
    alert("Could not clear fan letters: " + error.message);
  } else {
    await loadFanMessages();
    $("#messageCount").textContent = "0";
    alert("All fan letters have been cleared.");
  }

  button.disabled = false;
  button.textContent = "Clear All";
});


document.addEventListener("click", async event => {
  const replyButton = event.target.closest(".reply-fan");
  const editButton = event.target.closest(".edit-fan");
  const deleteButton = event.target.closest(".delete-fan");
  const cancelButton = event.target.closest(".cancel-fan");

  if (replyButton) {
    const card = replyButton.closest(".fan-message");
    card.querySelector(".fan-reply-form").classList.remove("hidden");
    card.querySelector(".fan-edit-form").classList.add("hidden");
    return;
  }

  if (editButton) {
    const card = editButton.closest(".fan-message");
    card.querySelector(".fan-edit-form").classList.remove("hidden");
    card.querySelector(".fan-reply-form").classList.add("hidden");
    return;
  }

  if (cancelButton) {
    const card = cancelButton.closest(".fan-message");
    card.querySelector(".fan-reply-form").classList.add("hidden");
    card.querySelector(".fan-edit-form").classList.add("hidden");
    return;
  }

  if (deleteButton) {
    const id = deleteButton.dataset.id;

    if (!confirm("Permanently delete this fan letter?")) return;

    deleteButton.disabled = true;
    deleteButton.textContent = "Deleting...";

    const { error } = await db
      .from("fan_messages")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Could not delete this fan letter: " + error.message);
      deleteButton.disabled = false;
      deleteButton.textContent = "Delete";
      return;
    }

    await loadFanMessages();

    const count = await db
      .from("fan_messages")
      .select("*", { count: "exact", head: true });

    $("#messageCount").textContent = count.count ?? "—";
  }
});


// Save edits to a fan letter.

document.addEventListener("submit", async event => {
  const editForm = event.target.closest(".fan-edit-form");
  const replyForm = event.target.closest(".fan-reply-form");

  if (editForm) {
    event.preventDefault();

    const id = editForm.dataset.id;
    const formData = new FormData(editForm);

    const updates = {
      name: formData.get("name").trim(),
      email: formData.get("email").trim(),
      message: formData.get("message").trim()
    };

    const button = editForm.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Saving...";

    const { error } = await db
      .from("fan_messages")
      .update(updates)
      .eq("id", id);

    if (error) {
      alert("Could not update fan letter: " + error.message);
      button.disabled = false;
      button.textContent = "Save changes";
      return;
    }

    await loadFanMessages();
    return;
  }

  if (replyForm) {
    event.preventDefault();

    const id = replyForm.dataset.id;
    const formData = new FormData(replyForm);

    const button = replyForm.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Sending...";

    const feedbackElement = replyForm
      .closest(".fan-message")
      .querySelector(".fan-feedback");

    feedbackElement.textContent = "";

    try {
      const { data: { session }, error: sessionError } =
        await db.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your admin session has expired. Please sign in again.");
      }

      const response = await fetch("/api/reply-fan-letter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          messageId: id,
          subject: formData.get("subject").trim(),
          message: formData.get("message").trim()
        })
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Could not send your reply.");
      }

      if (result.warning) {
        feedbackElement.textContent = result.warning;
        feedbackElement.classList.add("error");
      } else {
        feedbackElement.textContent = "Your reply was accepted by Brevo.";
        feedbackElement.classList.remove("error");
      }

      await loadFanMessages();

    } catch (error) {
      feedbackElement.textContent = error.message;
      feedbackElement.classList.add("error");

      button.disabled = false;
      button.textContent = "Send reply";
    }
  }
});


function downloadCSV(rows){
  const fields=["name","email","created_at"],quote=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const csv=[fields.join(","),...rows.map(row=>fields.map(field=>quote(row[field])).join(","))].join("\r\n");
  const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");
  a.href=url;
  a.download="de-mailer-subscribers.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Load and manage public letters and Mailers' Locker deliveries.

async function loadPublicLetters() {
  const container = $("#publicLettersList");

  const { data, error } = await db
    .from("public_letters")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.textContent = "Could not load public letters: " + error.message;
    return;
  }

  container.innerHTML = data?.length
    ? data.map(letter => `
        <article class="managed-record">
          <div class="record-display">
            <div class="record-info">
              <strong>${esc(letter.title)}</strong>
              <span>${letter.published ? "Published" : "Unpublished"}</span>
              <p>${esc(letter.body)}</p>
            </div>
            <div class="record-actions">
              <button type="button" class="button button-soft edit-record"
                data-table="public_letters" data-id="${esc(letter.id)}">Edit</button>
              <button type="button" class="button delete-record"
                data-table="public_letters" data-id="${esc(letter.id)}">Delete</button>
            </div>
          </div>

          <form class="record-edit-form hidden" data-table="public_letters"
            data-id="${esc(letter.id)}">
            <label>Title
              <input name="title" value="${esc(letter.title)}" required maxlength="140">
            </label>
            <label>Letter
              <textarea name="body" rows="5" required maxlength="5000">${esc(letter.body)}</textarea>
            </label>
            <label class="admin-check">
              <input type="checkbox" name="published" ${letter.published ? "checked" : ""}>
              Published
            </label>
            <div class="record-actions">
              <button type="submit" class="button button-purple">Save changes</button>
              <button type="button" class="button button-soft cancel-edit">Cancel</button>
            </div>
          </form>
        </article>
      `).join("")
    : '<p class="empty-admin">You have not published any letters yet.</p>';
}


async function loadMemberDeliveries() {
  const container = $("#memberDeliveriesList");

  const { data, error } = await db
    .from("member_deliveries")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.textContent = "Could not load deliveries: " + error.message;
    return;
  }

  container.innerHTML = data?.length
    ? data.map(delivery => `
        <article class="managed-record">
          <div class="record-display">
            <div class="record-info">
              <strong>${esc(delivery.title)}</strong>
              <p>${esc(delivery.body)}</p>
            </div>
            <div class="record-actions">
              <button type="button" class="button button-soft edit-record"
                data-table="member_deliveries" data-id="${esc(delivery.id)}">Edit</button>
              <button type="button" class="button delete-record"
                data-table="member_deliveries" data-id="${esc(delivery.id)}">Delete</button>
            </div>
          </div>

          <form class="record-edit-form hidden" data-table="member_deliveries"
            data-id="${esc(delivery.id)}">
            <label>Title
              <input name="title" value="${esc(delivery.title)}" required maxlength="140">
            </label>
            <label>Message
              <textarea name="body" rows="5" required maxlength="5000">${esc(delivery.body)}</textarea>
            </label>
            <div class="record-actions">
              <button type="submit" class="button button-purple">Save changes</button>
              <button type="button" class="button button-soft cancel-edit">Cancel</button>
            </div>
          </form>
        </article>
      `).join("")
    : '<p class="empty-admin">No exclusive deliveries yet.</p>';
}


// Handle Edit, Cancel and Delete buttons.
document.addEventListener("click", async event => {
  const editButton = event.target.closest(".edit-record");
  const cancelButton = event.target.closest(".cancel-edit");
  const deleteButton = event.target.closest(".delete-record");

  if (editButton) {
    const record = editButton.closest(".managed-record");
    record.querySelector(".record-display").classList.add("hidden");
    record.querySelector(".record-edit-form").classList.remove("hidden");
    return;
  }

  if (cancelButton) {
    const record = cancelButton.closest(".managed-record");
    record.querySelector(".record-edit-form").classList.add("hidden");
    record.querySelector(".record-display").classList.remove("hidden");
    return;
  }

  if (deleteButton) {
    const table = deleteButton.dataset.table;
    const id = deleteButton.dataset.id;

    if (!["public_letters", "member_deliveries"].includes(table)) return;

    const confirmed = confirm(
      "Are you sure you want to permanently delete this item? This cannot be undone."
    );

    if (!confirmed) return;

    deleteButton.disabled = true;
    deleteButton.textContent = "Deleting...";

    const { error } = await db
      .from(table)
      .delete()
      .eq("id", id);

    if (error) {
      alert("Could not delete this item: " + error.message);
      deleteButton.disabled = false;
      deleteButton.textContent = "Delete";
      return;
    }

    if (table === "public_letters") {
      await loadPublicLetters();
    } else {
      await loadMemberDeliveries();
    }
  }
});


// Save edited letters and deliveries.
document.addEventListener("submit", async event => {
  const form = event.target.closest(".record-edit-form");
  if (!form) return;

  event.preventDefault();

  const table = form.dataset.table;
  const id = form.dataset.id;

  if (!["public_letters", "member_deliveries"].includes(table)) return;

  const data = new FormData(form);

  const updates = {
    title: data.get("title").trim(),
    body: data.get("body").trim()
  };

  if (table === "public_letters") {
  updates.published = form.elements.published.checked;

  if (updates.published) {
    updates.published_at = new Date().toISOString();
  }
}

  const saveButton = form.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  const { error } = await db
    .from(table)
    .update(updates)
    .eq("id", id);

  if (error) {
    alert("Could not save changes: " + error.message);
    saveButton.disabled = false;
    saveButton.textContent = "Save changes";
    return;
  }

  if (table === "public_letters") {
    await loadPublicLetters();
  } else {
    await loadMemberDeliveries();
  }
});

// Broadcast Mailer: compose, preview and save a local draft only.
// Live email delivery is intentionally disabled until a compliant sender is configured.

// Broadcast Mailer: compose, preview, save and send.

const BROADCAST_DRAFT_KEY = "deMailerBroadcastDraftV1";

function getBroadcastDraft() {
  return {
    campaignType: $("#campaignType").value,
    subject: $("#broadcastSubject").value.trim(),
    message: $("#broadcastMessage").value.trim(),
    buttonText: $("#broadcastButtonText").value.trim(),
    buttonUrl: $("#broadcastButtonUrl").value.trim()
  };
}

function setBroadcastDraft(draft) {
  if (!draft) return;

  $("#campaignType").value = draft.campaignType || "new-music";
  $("#broadcastSubject").value = draft.subject || "";
  $("#broadcastMessage").value = draft.message || "";
  $("#broadcastButtonText").value = draft.buttonText || "";
  $("#broadcastButtonUrl").value = draft.buttonUrl || "";
}

function validateBroadcast(draft) {
  if (!draft.subject || !draft.message) {
    feedback("#broadcastFeedback", "Enter an email subject and message first.", true);
    return false;
  }

  if (
    draft.buttonUrl &&
    !/^https:\/\/[^\s]+$/i.test(draft.buttonUrl)
  ) {
    feedback("#broadcastFeedback", "The optional link must begin with https://.", true);
    return false;
  }

  return true;
}

function previewBroadcast() {
  const draft = getBroadcastDraft();

  if (!validateBroadcast(draft)) return;

  const typeLabels = {
    "new-music": "NEW MUSIC",
    birthday: "A SPECIAL WISH",
    show: "SHOW ANNOUNCEMENT",
    general: "A NOTE FROM DE MAILER"
  };

  $("#broadcastPreview").innerHTML = `
  <header>
    <div class="preview-brand">
      <span class="brand-mark">
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="10" width="38" height="28" rx="5"
        stroke="currentColor" stroke-width="2.8"/>
      <path d="M7 14L24 27L41 14"
        stroke="currentColor" stroke-width="2.8"
        stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 36L19 25M41 36L29 25"
        stroke="currentColor" stroke-width="2.8"
        stroke-linecap="round"/>
    </svg>
    </span> DE MAILER <small>THE MAILERS</small>
    </div>
  </header>

    <div class="preview-kicker">
      ${esc(typeLabels[draft.campaignType] || "THE MAILERS")}
    </div>

    <h3>${esc(draft.subject)}</h3>

    <p class="preview-message">
      ${esc(draft.message).replace(/\n/g, "<br>")}
    </p>

    ${
      draft.buttonText && draft.buttonUrl
        ? `<div class="preview-link">
             ${esc(draft.buttonText)} · ${esc(draft.buttonUrl)}
           </div>`
        : ""
    }

    <div class="preview-signoff">
      Yours truly,<br><strong>De Mailer</strong>
    </div>
  `;

  feedback("#broadcastFeedback", "Email preview updated.");
}

$("#previewBroadcast").addEventListener("click", previewBroadcast);


// Save draft.

$("#saveBroadcast").addEventListener("click", () => {
  const draft = getBroadcastDraft();

  if (!validateBroadcast(draft)) return;

  try {
    localStorage.setItem(BROADCAST_DRAFT_KEY, JSON.stringify(draft));

    $("#broadcastStatus").textContent = "Draft saved";

    feedback("#broadcastFeedback", "Your draft has been saved.");
  } catch (error) {
    feedback("#broadcastFeedback", "Could not save the draft in this browser.", true);
  }
});


// Send broadcast through the secure Vercel API endpoint.

$("#sendBroadcast").addEventListener("click", async () => {
  const draft = getBroadcastDraft();

  if (!validateBroadcast(draft)) return;

  const recipientCount = Number($("#broadcastRecipientCount").textContent);

  if (!recipientCount || recipientCount < 1) {
    feedback("#broadcastFeedback", "There are no eligible subscribers to receive this broadcast.", true);
    return;
  }

  const confirmed = confirm(
    `Send this email to ${recipientCount} eligible subscribers?\n\nSubject: ${draft.subject}\n\nThis action cannot be undone.`
  );

  if (!confirmed) return;

  const button = $("#sendBroadcast");
  const originalText = button.innerHTML;

  button.disabled = true;
  button.textContent = "Sending...";
  feedback("#broadcastFeedback", "Sending your broadcast. Please wait...");

  try {
    const { data: { session }, error: sessionError } =
      await db.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Your admin session has expired. Please sign in again.");
    }

    const response = await fetch("/api/send-broadcast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        subject: draft.subject,
        message: draft.message,
        buttonText: draft.buttonText,
        buttonUrl: draft.buttonUrl
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      throw new Error(
        result.error || "Brevo could not accept your broadcast."
      );
    }

    const accepted = result.recipientCount ?? recipientCount;

    feedback(
      "#broadcastFeedback",
      `Success! Brevo accepted your broadcast for ${accepted} recipients.`
    );

    $("#broadcastStatus").textContent = "Last broadcast accepted";

  } catch (error) {
    feedback(
      "#broadcastFeedback",
      error.message || "Something went wrong while sending your broadcast.",
      true
    );

  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
});


// Clear composer.

$("#clearBroadcast").addEventListener("click", () => {
  $("#broadcastForm").reset();

  $("#broadcastPreview").innerHTML = `
    <div class="preview-brand">
      <span>✉</span> DE MAILER <small>THE MAILERS</small>
    </div>
    <p class="preview-placeholder">
      Your email preview will appear here.
    </p>
  `;

  $("#broadcastStatus").textContent = "Draft not saved";

  feedback("#broadcastFeedback", "Composer cleared.");
});


// Restore previously saved draft.

try {
  const savedDraft = localStorage.getItem(BROADCAST_DRAFT_KEY);

  if (savedDraft) {
    setBroadcastDraft(JSON.parse(savedDraft));
    $("#broadcastStatus").textContent = "Saved draft available";
  }
} catch (error) {
  $("#broadcastStatus").textContent = "No saved draft";
}


// Forgot Password: request a secure recovery email.


// Custom Forgot Password Modal

const forgotPasswordLink = $("#forgotPasswordLink");
const forgotPasswordModal = $("#forgotPasswordModal");
const forgotPasswordForm = $("#forgotPasswordForm");
const forgotPasswordEmail = $("#forgotPasswordEmail");
const cancelForgotPassword = $("#cancelForgotPassword");
const sendResetLinkButton = $("#sendResetLinkButton");
const forgotModalFeedback = $("#forgotModalFeedback");

function closeForgotPasswordModal() {
  forgotPasswordModal.hidden = true;
  forgotPasswordForm.reset();
  forgotModalFeedback.textContent = "";
  forgotModalFeedback.classList.remove("error");
}

forgotPasswordLink.addEventListener("click", event => {
  event.preventDefault();

  const loginEmail = $('#adminLoginForm input[name="email"]');
  forgotPasswordEmail.value = loginEmail.value.trim();

  forgotPasswordModal.hidden = false;

  setTimeout(() => forgotPasswordEmail.focus(), 100);
});

cancelForgotPassword.addEventListener("click", closeForgotPasswordModal);

forgotPasswordModal.addEventListener("click", event => {
  if (event.target === forgotPasswordModal) {
    closeForgotPasswordModal();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !forgotPasswordModal.hidden) {
    closeForgotPasswordModal();
  }
});

forgotPasswordForm.addEventListener("submit", async event => {
  event.preventDefault();

  const email = forgotPasswordEmail.value.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    forgotModalFeedback.textContent = "Please enter a valid email address.";
    forgotModalFeedback.classList.add("error");
    return;
  }

  sendResetLinkButton.disabled = true;
  sendResetLinkButton.textContent = "Sending...";

  forgotModalFeedback.textContent = "Please wait while we process your request.";
  forgotModalFeedback.classList.remove("error");

  try {
    const response = await fetch("/api/request-admin-reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Could not process your request. Please try again.");
    }

    forgotModalFeedback.textContent =
      result.message ||
      "If the address belongs to an admin account, a recovery email will be sent.";

  } catch (error) {
    forgotModalFeedback.textContent =
      error.message || "Something went wrong. Please try again.";

    forgotModalFeedback.classList.add("error");

  } finally {
    sendResetLinkButton.disabled = false;
    sendResetLinkButton.textContent = "Send Reset Link";
  }
});


// Admin Change Password

const changePasswordForm = $("#changePasswordForm");
const changePasswordButton = $("#changePasswordButton");

document.querySelectorAll(".password-toggle").forEach(toggle => {
  toggle.addEventListener("click", () => {
    const input = document.getElementById(toggle.dataset.password);

    if (!input) return;

    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    toggle.textContent = showing ? "Show" : "Hide";
  });
});

changePasswordForm.addEventListener("submit", async event => {
  event.preventDefault();

  const currentPassword = $("#currentAdminPassword").value;
  const newPassword = $("#newAdminPassword").value;
  const confirmPassword = $("#confirmAdminPassword").value;

  const button = changePasswordButton;

  if (newPassword.length < 8) {
    return feedback(
      "#changePasswordFeedback",
      "Your new password must contain at least 8 characters.",
      true
    );
  }

  if (newPassword !== confirmPassword) {
    return feedback(
      "#changePasswordFeedback",
      "Your new passwords do not match.",
      true
    );
  }

  if (currentPassword === newPassword) {
    return feedback(
      "#changePasswordFeedback",
      "Your new password must be different from your current password.",
      true
    );
  }

  button.disabled = true;
  button.textContent = "Verifying...";

  try {
    const { data: { user }, error: userError } = await db.auth.getUser();

    if (userError || !user?.email) {
      throw new Error("Your admin session could not be verified. Please sign in again.");
    }

    // Verify the current password before allowing a change.
    const { error: verifyError } = await db.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    });

    if (verifyError) {
      throw new Error("Your current password is incorrect.");
    }

    button.textContent = "Updating...";

    const { error: updateError } = await db.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      throw updateError;
    }

    changePasswordForm.reset();

    document.querySelectorAll(".password-toggle").forEach(toggle => {
      toggle.textContent = "Show";
    });

    feedback(
      "#changePasswordFeedback",
      "Your password has been changed successfully."
    );

  } catch (error) {
    feedback(
      "#changePasswordFeedback",
      error.message || "Could not change your password. Please try again.",
      true
    );

  } finally {
    button.disabled = false;
    button.textContent = "Update Password";
  }
});


// Admin Change Email Address

const changeEmailForm = $("#changeEmailForm");
const changeEmailButton = $("#changeEmailButton");
const emailVerificationGroup = $("#emailVerificationGroup");
const emailVerificationCode = $("#emailVerificationCode");

let emailChangeCodeSent = false;

changeEmailForm.addEventListener("submit", async event => {
  event.preventDefault();

  const feedbackSelector = "#changeEmailFeedback";

  changeEmailButton.disabled = true;

  try {
    const { data: { session }, error: sessionError } =
      await db.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Your admin session has expired. Please sign in again.");
    }

    if (!emailChangeCodeSent) {
      // Stage 1: Request verification code.

      const password = $("#emailChangeCurrentPassword").value;
      const newEmail = $("#newAdminEmail").value.trim().toLowerCase();

      if (!password || !newEmail) {
        throw new Error("Enter your current password and new email address.");
      }

      changeEmailButton.textContent = "Sending code...";

      const response = await fetch("/api/request-email-change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          password,
          newEmail
        })
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Could not send verification code.");
      }

      emailChangeCodeSent = true;
      emailVerificationGroup.hidden = false;

      $("#emailChangeCurrentPassword").disabled = true;
      $("#newAdminEmail").readOnly = true;

      emailVerificationCode.required = true;

      changeEmailButton.textContent = "Confirm Email Change";

      feedback(feedbackSelector, result.message);
      emailVerificationCode.focus();

    } else {
      // Stage 2: Verify code and complete email change.

      const code = emailVerificationCode.value.trim();

      if (!/^\d{6}$/.test(code)) {
        throw new Error("Enter the six-digit verification code.");
      }

      changeEmailButton.textContent = "Verifying code...";

      const response = await fetch("/api/confirm-email-change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ code })
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Could not confirm your new email.");
      }

      // Update the email displayed in the admin dashboard.
      if (result.email) {
        $("#adminEmail").textContent = result.email;
      }

      changeEmailForm.reset();

      emailChangeCodeSent = false;
      emailVerificationGroup.hidden = true;
      emailVerificationGroup.querySelector("input").required = false;

      $("#emailChangeCurrentPassword").disabled = false;
      $("#newAdminEmail").readOnly = false;

      changeEmailButton.textContent = "Update Email Address";

      feedback(feedbackSelector, result.message);
    }

  } catch (error) {
    feedback(
      feedbackSelector,
      error.message || "Something went wrong. Please try again.",
      true
    );

  } finally {
    changeEmailButton.disabled = false;

    if (!emailChangeCodeSent) {
      changeEmailButton.textContent = "Update Email Address";
    } else if (changeEmailButton.textContent !== "Confirm Email Change") {
      changeEmailButton.textContent = "Confirm Email Change";
    }
  }
});


$("#adminLoginForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!db) return feedback("#adminLoginFeedback", "Supabase is not configured.", true);
  const d = Object.fromEntries(new FormData(e.currentTarget));
  const email = d.email.trim().toLowerCase();
  const password = d.password;
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) return feedback("#adminLoginFeedback", error.message, true);
  await requireAdmin(data.user);
});

$("#adminSignOut").addEventListener("click",async()=>{await db.auth.signOut();location.reload()});

$("#publishLetterForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const d=Object.fromEntries(new FormData(e.currentTarget));
  const {error}=await db.from("public_letters").insert({title:d.title.trim(),body:d.body.trim(),published:e.currentTarget.published.checked});
  feedback("#publishFeedback",error?error.message:"Your letter has been saved.",!!error);
  if (!error) {
  e.currentTarget.reset();
  await loadPublicLetters();
}
});

$("#memberDeliveryForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const d=Object.fromEntries(new FormData(e.currentTarget));
  const {error}=await db.from("member_deliveries").insert({title:d.title.trim(),body:d.body.trim()});
  feedback("#memberFeedback",error?error.message:"Exclusive delivery published to the locker.",!!error);
  if (!error) {
  e.currentTarget.reset();
  await loadMemberDeliveries();
}
});

(async()=>{
  if(!db){
    $("#adminLogin").classList.remove("hidden");
    return feedback("#adminLoginFeedback","First configure your Supabase URL and anon key in admin.js.",true);
  }
  const {data:{session}}=await db.auth.getSession();
  await requireAdmin(session?.user||null);
})();



/* =========================================
   MUSIC DELIVERIES MANAGEMENT
========================================= */

const MUSIC_BUCKET = "music-artwork";

function resetMusicForm() {
  $("#musicDeliveryForm").reset();
  $("#musicDeliveryId").value = "";
  $("#musicSortOrder").value = "0";
  $("#musicPublished").checked = true;
  $("#musicArtwork").required = false;
  $("#saveMusicDelivery").textContent = "Add song";
  $("#cancelMusicEdit").hidden = true;
  feedback("#musicDeliveryFeedback", "");
}

function getStoragePath(publicUrl) {
  if (!publicUrl) return null;

  const marker = `/storage/v1/object/public/${MUSIC_BUCKET}/`;
  const index = publicUrl.indexOf(marker);

  if (index === -1) return null;

  return decodeURIComponent(publicUrl.slice(index + marker.length));
}


function renderAdminMusicDeliveries(search = "") {
  const container = $("#musicDeliveriesList");
  const count = $("#adminMusicSearchCount");

  const songs = window.adminMusicDeliveries || [];
  const query = search.trim().toLowerCase();

  const matches = songs.filter(song =>
    `${song.title || ""} ${song.year || ""} ${song.tag || ""}`
      .toLowerCase()
      .includes(query)
  );

  if (count) {
    count.textContent = `${matches.length} ${
      matches.length === 1 ? "song found" : "songs found"
    }`;
  }

  container.innerHTML = matches.length
    ? matches.map(song => `
        <article class="managed-record">
          <div class="music-admin-record">
            ${
              song.artwork_url
                ? `<img src="${esc(song.artwork_url)}"
                    alt="${esc(song.title)} artwork" loading="lazy">`
                : `<div class="music-artwork-placeholder">♫</div>`
            }

            <div class="record-info">
              <strong>${esc(song.title)}</strong>

              <span>
                ${esc(song.year || "Year not set")}
                · ${esc(song.tag || "No tag")}
              </span>

              <span class="music-status ${song.is_published ? "" : "unpublished"}">
                ${song.is_published ? "Published" : "Unpublished"}
              </span>

              ${
                song.listen_url
                  ? `<a href="${esc(song.listen_url)}"
                      target="_blank"
                      rel="noopener noreferrer">
                      Open listening link ↗
                    </a>`
                  : ""
              }
            </div>
          </div>

          <div class="record-actions">
            <button
              type="button"
              class="button button-soft edit-music"
              data-id="${esc(song.id)}">
              Edit
            </button>

            <button
              type="button"
              class="button delete-record delete-music"
              data-id="${esc(song.id)}">
              Delete
            </button>
          </div>
        </article>
      `).join("")
    : `<p class="empty-admin">${
        query
          ? "No songs match your search. Try another title or year."
          : "No songs have been added yet. Add your first delivery above."
      }</p>`;
}


async function loadMusicDeliveries() {
  const container = $("#musicDeliveriesList");
  if (!container) return;

  container.textContent = "Loading music catalogue...";

  const { data, error } = await db
    .from("music_deliveries")
    .select("*")
    .order("year", { ascending: false, nullsFirst: false })
    .order("sort_order", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    container.textContent = "Could not load music: " + error.message;
    return;
  }

  window.adminMusicDeliveries = data || [];

  renderAdminMusicDeliveries(
    $("#adminMusicSearch")?.value || ""
  );
}


// Search immediately as you type.
$("#adminMusicSearch").addEventListener("input", event => {
  renderAdminMusicDeliveries(event.target.value);
});



// Add or update a song.

$("#musicDeliveryForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = $("#saveMusicDelivery");
  const id = $("#musicDeliveryId").value;
  const file = $("#musicArtwork").files[0];

  const title = $("#musicTitle").value.trim();
  const yearValue = $("#musicYear").value.trim();
  const tag = $("#musicTag").value.trim();
  const listenUrl = $("#musicListenUrl").value.trim();
  const spotifyUrl = $("#musicSpotifyUrl").value.trim();
  const appleUrl = $("#musicAppleUrl").value.trim();
  const youtubeUrl = $("#musicYoutubeUrl").value.trim();
  const snippet = $("#musicSnippet").value.trim();
  const sortOrder = Number($("#musicSortOrder").value || 0);
  const isPublished = $("#musicPublished").checked;

  if (!title || !listenUrl) {
    return feedback(
      "#musicDeliveryFeedback",
      "Enter the song title and main listening link.",
      true
    );
  }

  if (!/^https:\/\/[^\s]+$/i.test(listenUrl)) {
    return feedback(
      "#musicDeliveryFeedback",
      "The listening link must begin with https://.",
      true
    );
  }

  if (yearValue && (!Number.isInteger(Number(yearValue)) ||
      Number(yearValue) < 1900 || Number(yearValue) > 2100)) {
    return feedback(
      "#musicDeliveryFeedback",
      "Enter a valid release year.",
      true
    );
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    return feedback(
      "#musicDeliveryFeedback",
      "Display order must be a whole number of zero or higher.",
      true
    );
  }

  if (file) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      return feedback(
        "#musicDeliveryFeedback",
        "Artwork must be JPG, PNG or WebP.",
        true
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return feedback(
        "#musicDeliveryFeedback",
        "Artwork must be smaller than 5 MB.",
        true
      );
    }
  }

  const existingSong = (window.adminMusicDeliveries || [])
    .find(song => song.id === id);

  let uploadedPath = null;
  let artworkUrl = existingSong?.artwork_url || null;

  button.disabled = true;
  button.textContent = file ? "Uploading artwork..." : "Saving...";

  try {
    // Upload new artwork when a file is selected.
    if (file) {
      const extension = file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/png"
          ? "png"
          : "webp";

      uploadedPath = `${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await db.storage
        .from(MUSIC_BUCKET)
        .upload(uploadedPath, file, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = db.storage
        .from(MUSIC_BUCKET)
        .getPublicUrl(uploadedPath);

      artworkUrl = publicData.publicUrl;
    }

    const updates = {
      title,
      year: yearValue ? Number(yearValue) : null,
      tag: tag || null,
      artwork_url: artworkUrl,
      listen_url: listenUrl,
      spotify_url: spotifyUrl || null,
      apple_url: appleUrl || null,
      youtube_url: youtubeUrl || null,
      snippet: snippet || null,
      sort_order: sortOrder,
      is_published: isPublished,
      updated_at: new Date().toISOString()
    };

    button.textContent = "Saving song...";

    let result;

    if (id) {
      result = await db
        .from("music_deliveries")
        .update(updates)
        .eq("id", id);
    } else {
      result = await db
        .from("music_deliveries")
        .insert(updates);
    }

    if (result.error) throw result.error;

    // Remove the previous artwork only after a successful replacement.
    if (
      file &&
      existingSong?.artwork_url &&
      existingSong.artwork_url !== artworkUrl
    ) {
      const oldPath = getStoragePath(existingSong.artwork_url);

      if (oldPath) {
        await db.storage.from(MUSIC_BUCKET).remove([oldPath]);
      }
    }

    feedback(
      "#musicDeliveryFeedback",
      id
        ? "Song updated successfully."
        : "New song added to Music Deliveries."
    );

    resetMusicForm();
    await loadMusicDeliveries();

  } catch (error) {
    // Avoid leaving an unused uploaded image if the database save fails.
    if (uploadedPath) {
      await db.storage.from(MUSIC_BUCKET).remove([uploadedPath]);
    }

    feedback(
      "#musicDeliveryFeedback",
      error.message || "Could not save this song.",
      true
    );

  } finally {
    button.disabled = false;

    if ($("#musicDeliveryId").value) {
      button.textContent = "Save changes";
    } else {
      button.textContent = "Add song";
    }
  }
});


// Edit and delete music records.

document.addEventListener("click", async event => {
  const editButton = event.target.closest(".edit-music");
  const deleteButton = event.target.closest(".delete-music");

  if (editButton) {
    const song = (window.adminMusicDeliveries || [])
      .find(item => item.id === editButton.dataset.id);

    if (!song) return;

    $("#musicDeliveryId").value = song.id;
    $("#musicTitle").value = song.title || "";
    $("#musicYear").value = song.year || "";
    $("#musicTag").value = song.tag || "";
    $("#musicListenUrl").value = song.listen_url || "";
    $("#musicSpotifyUrl").value = song.spotify_url || "";
    $("#musicAppleUrl").value = song.apple_url || "";
    $("#musicYoutubeUrl").value = song.youtube_url || "";
    $("#musicSnippet").value = song.snippet || "";
    $("#musicSortOrder").value = song.sort_order ?? 0;
    $("#musicPublished").checked = song.is_published;

    $("#musicArtwork").value = "";
    $("#musicArtwork").required = false;

    $("#saveMusicDelivery").textContent = "Save changes";
    $("#cancelMusicEdit").hidden = false;

    feedback(
      "#musicDeliveryFeedback",
      `Editing "${song.title}". Leave artwork empty to keep the current image.`
    );

    $("#musicManagement").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    $("#musicTitle").focus();
    return;
  }

  if (deleteButton) {
  const song = (window.adminMusicDeliveries || [])
    .find(item => item.id === deleteButton.dataset.id);

  if (!song) return;

  pendingMusicDelete = song;

  $("#deleteMusicSongTitle").textContent =
    `${song.title} (${song.year || "year not set"})`;

  feedback("#deleteMusicFeedback", "");

  $("#deleteMusicModal").hidden = false;
  $("#confirmDeleteMusic").disabled = false;
  $("#confirmDeleteMusic").textContent = "Delete song";

  $("#cancelDeleteMusic").focus();
  return;
}


/* =========================================
   CUSTOM MUSIC DELETE MODAL
========================================= */

let pendingMusicDelete = null;

function closeDeleteMusicModal() {
  $("#deleteMusicModal").hidden = true;
  pendingMusicDelete = null;

  $("#confirmDeleteMusic").disabled = false;
  $("#confirmDeleteMusic").textContent = "Delete song";

  feedback("#deleteMusicFeedback", "");
}


// Cancel deletion.
$("#cancelDeleteMusic").addEventListener("click", closeDeleteMusicModal);


// Clicking the backdrop also closes the modal.
$("#deleteMusicModal").addEventListener("click", event => {
  if (event.target === $("#deleteMusicModal")) {
    closeDeleteMusicModal();
  }
});


// Escape closes the modal.
document.addEventListener("keydown", event => {
  if (
    event.key === "Escape" &&
    !$("#deleteMusicModal").hidden
  ) {
    closeDeleteMusicModal();
  }
});


// Confirm permanent deletion.
$("#confirmDeleteMusic").addEventListener("click", async () => {
  if (!pendingMusicDelete) return;

  const song = pendingMusicDelete;
  const button = $("#confirmDeleteMusic");

  button.disabled = true;
  button.textContent = "Deleting...";

  feedback("#deleteMusicFeedback", "");

  try {
    const { error } = await db
      .from("music_deliveries")
      .delete()
      .eq("id", song.id);

    if (error) throw error;

    // Clean up artwork stored in Supabase Storage.
    const artworkPath = getStoragePath(song.artwork_url);

    if (artworkPath) {
      const { error: storageError } = await db.storage
        .from(MUSIC_BUCKET)
        .remove([artworkPath]);

      if (storageError) {
        console.warn(
          "Song deleted, but artwork cleanup failed:",
          storageError.message
        );
      }
    }

    closeDeleteMusicModal();

    await loadMusicDeliveries();

    feedback(
      "#musicDeliveryFeedback",
      `"${song.title}" has been deleted from Music Deliveries.`
    );

  } catch (error) {
    feedback(
      "#deleteMusicFeedback",
      error.message || "Could not delete this song. Please try again.",
      true
    );

    button.disabled = false;
    button.textContent = "Try again";
  }
});


$("#cancelMusicEdit").addEventListener("click", resetMusicForm);


/* =========================================
   LATEST RELEASE SETTINGS
========================================= */

async function loadLatestRelease() {
  const input = $("#latestReleaseEmbedUrl");
  if (!input) return;

  const { data, error } = await db
    .from("site_settings")
    .select("value")
    .eq("key", "latest_release_embed_url")
    .maybeSingle();

  if (error) {
    feedback(
      "#latestReleaseFeedback",
      "Could not load the latest release setting: " + error.message,
      true
    );
    return;
  }

  input.value = data?.value || "";
}


$("#latestReleaseForm").addEventListener("submit", async event => {
  event.preventDefault();

  const input = $("#latestReleaseEmbedUrl");
  const url = input.value.trim();

  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch {
    return feedback(
      "#latestReleaseFeedback",
      "Enter a valid Spotify embed URL.",
      true
    );
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "open.spotify.com" ||
    !/^\/embed\/(track|album)\/[A-Za-z0-9]+\/?$/.test(parsedUrl.pathname)
  ) {
    return feedback(
      "#latestReleaseFeedback",
      "Use a Spotify embed link for a track or album.",
      true
    );
  }

  const button = $("#saveLatestRelease");
  button.disabled = true;
  button.textContent = "Updating...";

  try {
    const { error } = await db
      .from("site_settings")
      .upsert({
        key: "latest_release_embed_url",
        value: url,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "key"
      });

    if (error) throw error;

    feedback(
      "#latestReleaseFeedback",
      "Latest Release preview updated successfully."
    );

  } catch (error) {
    feedback(
      "#latestReleaseFeedback",
      error.message || "Could not update the Latest Release preview.",
      true
    );

  } finally {
    button.disabled = false;
    button.textContent = "Update Latest Release";
  }
});


(async()=>{
  if(!db){
    $("#adminLogin").classList.remove("hidden");
    return feedback("#adminLoginFeedback","First configure your Supabase URL and anon key in admin.js.",true);
  }
  const {data:{session}}=await db.auth.getSession();
  await requireAdmin(session?.user||null);
})();