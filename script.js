// DE MAILER — THE POST OFFICE
// 1) Paste your Supabase Project URL and anon/public key below.
// 2) Add your song details, artwork, audio snippets and social links in the arrays below.
// Never put a Supabase service_role key in this file.

const SUPABASE_URL = "https://jpehecxayzttovrdjsbd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_2cIb-WGMArfeoc2OcQuO9w_pNDMxAMX";
const supabaseReady = SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
const db = supabaseReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// EDIT YOUR MUSIC HERE. Leave snippet blank if you don't have a preview.
// Use paths such as assets/music/song-name.mp3 and assets/music/song-name.jpg.
const tracks = [

  // { title: "Since 99", year: "2026", tag: "Latest release", artwork: "assets/artwork/Since_99.jpeg", snippet: "assets/music/since-99.mp3", spotify: "https://found.ee/Since99/ms-spotify-3", apple: "https://found.ee/Since99/ms-apple-0", youtube: "#" },
  { title: "Prisoners", year: "2026", tag: "Latest release", artwork: "assets/artwork/prisoners.png", listen: "https://found.ee/Prisoners-1" },

  { title: "Since 99", year: "2026", tag: "Latest release", artwork: "assets/artwork/since_99.png", listen: "https://found.ee/Since99" },

  { title: "Watch Over Me", year: "2023", tag: "Single", artwork: "assets/artwork/wom.png", listen: "demailer.fanlink.tv/vTSH" },

  { title: "Get Over You", year: "2023", tag: "Single", artwork: "assets/artwork/get_over_you.png", listen: "#" },

  { title: "I Believe", year: "2024", tag: "Single", artwork: "assets/artwork/i_believe.png", listen: "#" },

  { title: "Ishara Yangu", year: "2025", tag: "Single", artwork: "assets/artwork/ishara_yangu.png", listen: "#" },

  { title: "Downtown", year: "2025", tag: "Single", artwork: "assets/artwork/downtown.png", listen: "https://fanlink.tv/Demailer" },

  { title: "Omotena", year: "2025", tag: "Single", artwork: "assets/artwork/omotena.png", listen: "fanlink.tv/OmOtena" },

  { title: "Omoge", year: "2025", tag: "Single", artwork: "assets/artwork/omoge.png", listen: "#" },

  { title: "I For Like Dey", year: "2025", tag: "Single", artwork: "assets/artwork/ifld.png", listen: "#" },

  { title: "Tell It To Nobody", year: "2025", tag: "Single", artwork: "assets/artwork/titn.png", listen: "https://fanlink.tv/TITN" },

  { title: "The Mirror", year: "2026", tag: "Single", artwork: "assets/artwork/the_mirror.png", listen: "https://fanlink.tv/Themirror" },


  { title: "Orente", year: "2025", tag: "Latest release", artwork: "assets/artwork/orente.png", listen: "#" },

  { title: "Bamise", year: "2024", tag: "Latest release", artwork: "assets/artwork/bamise.png", listen: "#" },
  
];

// Add or replace these with your real profile URLs.
const socials = {
  instagram: "#", youtube: "#", facebook: "#", twitter: "#", tiktok: "#", listen: "#",
};

const $ = (selector) => document.querySelector(selector);
const musicGrid = $("#musicGrid");
let showAllTracks = false;

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}
function renderTracks(search = "") {
  const matches = tracks.filter(track => `${track.title} ${track.year} ${track.tag}`.toLowerCase().includes(search.toLowerCase()));
  const visible = showAllTracks || search ? matches : matches.slice(0, 4);
  $("#musicCount").textContent = `${matches.length} ${matches.length === 1 ? "delivery" : "deliveries"}`;
  if (!visible.length) {
    musicGrid.innerHTML = '<div class="empty-state">No songs found. Try another search.</div>';
    return;
  }
  musicGrid.innerHTML = visible.map((track, index) => `
    <article class="music-card">
      <div class="artwork">
        <div class="artwork-fallback">✉</div>
        ${track.artwork ? `<img src="${escapeHTML(track.artwork)}" alt="${escapeHTML(track.title)} artwork" onerror="this.style.display='none'">` : ""}
      </div>
      <div class="track-meta"><span class="track-tag">${escapeHTML(track.tag || "Release")}</span><span class="track-year">${escapeHTML(track.year)}</span></div>
      <h3>${escapeHTML(track.title)}</h3>

      ${track.snippet ? `<audio class="audio-player" controls preload="none" src="${escapeHTML(track.snippet)}">Your browser does not support audio.</audio>` : '<p class="no-preview"></p>'}

      <div class="stream-links">
        ${track.spotify && track.spotify !== "#" ? `<a href="${escapeHTML(track.spotify)}" target="_blank" rel="noopener">Spotify ↗</a>` : ""}
        ${track.apple && track.apple !== "#" ? `<a href="${escapeHTML(track.apple)}" target="_blank" rel="noopener">Apple Music ↗</a>` : ""}
        ${track.youtube && track.youtube !== "#" ? `<a href="${escapeHTML(track.youtube)}" target="_blank" rel="noopener">YouTube ↗</a>` : ""}
        ${track.listen && track.listen !== "#" ? `<a href="${escapeHTML(track.listen)}" target="_blank" rel="noopener">Listen</a>` : ""}
        ${[track.spotify,track.apple,track.youtube,track.listen].every(link => !link || link === "#") ? '<span class="stream-placeholder">Streaming link unavailable</span>' : ""}
      </div>
    </article>`).join("");
}
$("#musicSearch").addEventListener("input", e => renderTracks(e.target.value));
$("#showAllMusic").addEventListener("click", () => {
  showAllTracks = !showAllTracks;
  $("#showAllMusic").innerHTML = showAllTracks ? 'Show less <span>↑</span>' : 'See all music <span>↓</span>';
  renderTracks($("#musicSearch").value);
});
renderTracks();

Object.entries(socials).forEach(([name, url]) => {
  const link = document.querySelector(`[data-social="${name}"]`);
  if (link && url && url !== "#") link.href = url;
  else if (link) link.addEventListener("click", e => { e.preventDefault(); showToast(`Add your ${name} profile link in script.js.`); });
});

$("#year").textContent = new Date().getFullYear();
$("#menuToggle").addEventListener("click", () => {
  const nav = $("#mainNav"), open = nav.classList.toggle("open");
  $("#menuToggle").setAttribute("aria-expanded", String(open));
});
$("#mainNav").querySelectorAll("a").forEach(a => a.addEventListener("click", () => $("#mainNav").classList.remove("open")));

function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}
function setFeedback(selector, message, error = false) {
  const el = $(selector); el.textContent = message; el.classList.toggle("error", error);
}
function setBusy(button, busy, label) {
  button.disabled = busy; button.dataset.original ||= button.innerHTML;
  button.innerHTML = busy ? "Please wait…" : (label || button.dataset.original);
}

// Newsletter: subscribers are stored privately in Supabase. No public read access.
$("#subscribeForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, button = form.querySelector("button[type=submit]");
  if (!db) return setFeedback("#subscribeFeedback", "Connect your Supabase URL and anon key in script.js first.", true);
  const data = Object.fromEntries(new FormData(form));
  setBusy(button, true);
  const { error } = await db.from("newsletter_subscribers").insert({
    name: data.name.trim(), email: data.email.trim().toLowerCase(), consent: true
  });
  setBusy(button, false);
  if (error) {
    const message = error.code === "23505" ? "This email is already on the list. Thank you for being here!" : "We couldn't save your signup. Please try again.";
    setFeedback("#subscribeFeedback", message, error.code !== "23505");
  } else {
    form.reset(); setFeedback("#subscribeFeedback", "You're on the list. Welcome to THE MAILERS! ✉");
  }
});

// Fan letters are saved to the database. Email alerts require an optional email/Edge Function setup.
$("#letterForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, button = form.querySelector("button[type=submit]");
  if (!db) return setFeedback("#letterFeedback", "Connect your Supabase URL and anon key in script.js first.", true);
  const data = Object.fromEntries(new FormData(form));
  setBusy(button, true);
  const { error } = await db.from("fan_messages").insert({
    name: data.name.trim(), email: data.email.trim().toLowerCase(), message: data.message.trim()
  });
  setBusy(button, false);
  if (error) setFeedback("#letterFeedback", "Your letter couldn't be delivered. Please try again.", true);
  else { form.reset(); setFeedback("#letterFeedback", "Your letter has been delivered. Thank you for writing. ✉"); }
});

// Letters published by the Postmaster.
async function loadPublicLetters() {
  if (!db) return;
  const { data, error } = await db.from("public_letters").select("id,title,body,published_at").eq("published", true).order("published_at", { ascending: false }).limit(12);
  if (error || !data?.length) return;
  $("#lettersGrid").innerHTML = data.map(letter => `
    <article class="letter-card"><span class="letter-date">${new Date(letter.published_at).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"})}</span>
    <h3>${escapeHTML(letter.title)}</h3><p>${escapeHTML(letter.body).replace(/\n/g,"<br>")}</p>
    <span class="letter-bottom">With love, Tha Postman <b>✉</b></span></article>`).join("");
}

// Simple member locker: no Supabase Auth, passwords, magic links or accounts.
// The RPC checks whether the entered email is on the newsletter list.
let lockerMemberEmail = "";
async function loadMemberDeliveries() {
  const { data, error } = await db.from("member_deliveries").select("title,body,created_at").order("created_at", {ascending:false}).limit(20);
  if (error) {
    $("#memberLetters").textContent = "Your postbox could not be loaded just now. Please try again.";
    return;
  }
  $("#memberLetters").innerHTML = data?.length ? data.map(item => `<article><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.body).replace(/\n/g,"<br>")}</p></article>`).join("<hr>") : "Your exclusive deliveries will appear here. Keep an eye on your postbox.";
}
$("#lockerForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!db) return setFeedback("#lockerFeedback", "Connect your Supabase URL and anon key in script.js first.", true);
  const form = e.currentTarget, email = new FormData(form).get("email").trim().toLowerCase(), button = $("#lockerSubmit");
  setBusy(button, true);
  const { data, error } = await db.rpc("is_mailer_member", { check_email: email });
  setBusy(button, false);
  if (error) return setFeedback("#lockerFeedback", "We couldn't check your membership right now. Please try again.", true);
  if (!data) return setFeedback("#lockerFeedback", "We couldn't find that email on THE MAILERS list. Join using the membership form first, then come back here.", true);
  lockerMemberEmail = email;
  $("#lockerForm").classList.add("hidden");
  $("#memberContent").classList.remove("hidden");
  await loadMemberDeliveries();
});
$("#lockerClose").addEventListener("click", () => {
  lockerMemberEmail = "";
  $("#memberContent").classList.add("hidden");
  $("#lockerForm").classList.remove("hidden");
  $("#lockerForm").reset();
  setFeedback("#lockerFeedback", "");
});
async function initSupabase() {
  if (!db) return;
  await loadPublicLetters();

}
initSupabase();
