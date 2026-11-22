// Uses the same Supabase project URL and anon key as script.js.
const SUPABASE_URL = "https://jpehecxayzttovrdjsbd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_2cIb-WGMArfeoc2OcQuO9w_pNDMxAMX";
const ready = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
const db = ready ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function feedback(id,msg,error=false){$(id).textContent=msg;$(id).classList.toggle("error",error)}
async function requireAdmin(user){
  if(!user){$("#adminLogin").classList.remove("hidden");$("#adminDashboard").classList.add("hidden");return false}
  const {data,error}=await db.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(error||!data){await db.auth.signOut();$("#adminLogin").classList.remove("hidden");$("#adminDashboard").classList.add("hidden");feedback("#adminLoginFeedback","This account is not authorized to access the Postmaster's Office.",true);return false}
  $("#adminLogin").classList.add("hidden");$("#adminDashboard").classList.remove("hidden");$("#adminEmail").textContent=user.email;await loadDashboard();return true;
}
async function loadDashboard(){
  const [subs,msgs]=await Promise.all([
    db.from("newsletter_subscribers").select("*",{count:"exact",head:true}),
    db.from("fan_messages").select("*",{count:"exact",head:true})
  ]);
  $("#subscriberCount").textContent=subs.count ?? "—";$("#messageCount").textContent=msgs.count ?? "—";$("#memberCount").textContent=subs.count ?? "—";
  const {data:subscribers,error}=await db.from("newsletter_subscribers").select("name,email,created_at").order("created_at",{ascending:false}).limit(5000);
  $("#subscribersTable").innerHTML=error?'<tr><td colspan="3">Could not load subscribers.</td></tr>':(subscribers?.length?subscribers.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.email)}</td><td>${new Date(s.created_at).toLocaleDateString()}</td></tr>`).join(""):'<tr><td colspan="3">No subscribers yet.</td></tr>');
  $("#exportSubscribers").onclick=()=>downloadCSV(subscribers||[]);
  const {data:messages,error:msgError}=await db.from("fan_messages").select("id,name,email,message,created_at").order("created_at",{ascending:false}).limit(300);
  $("#fanMessages").innerHTML=msgError?"Could not load fan letters.":(messages?.length?messages.map(m=>`<article class="fan-message"><header><strong>${esc(m.name)}</strong><span>${new Date(m.created_at).toLocaleString()}</span></header><small>${esc(m.email)}</small><p>${esc(m.message)}</p></article>`).join(""):'<p class="empty-admin">No fan letters yet.</p>');
}
function downloadCSV(rows){
  const fields=["name","email","created_at"],quote=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const csv=[fields.join(","),...rows.map(row=>fields.map(field=>quote(row[field])).join(","))].join("\r\n");
  const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="de-mailer-subscribers.csv";a.click();URL.revokeObjectURL(url);
}

$("#adminLoginForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (!db) {
    return feedback("#adminLoginFeedback", "Supabase is not configured.", true);
  }

  const d = Object.fromEntries(new FormData(e.currentTarget));
  const email = d.email.trim().toLowerCase();
  const password = d.password;

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return feedback("#adminLoginFeedback", error.message, true);
  }

  await requireAdmin(data.user);
});

$("#adminSignOut").addEventListener("click",async()=>{await db.auth.signOut();location.reload()});
$("#publishLetterForm").addEventListener("submit",async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const {error}=await db.from("public_letters").insert({title:d.title.trim(),body:d.body.trim(),published:e.currentTarget.published.checked});feedback("#publishFeedback",error?error.message:"Your letter has been saved.",!!error);if(!error)e.currentTarget.reset()});
$("#memberDeliveryForm").addEventListener("submit",async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const {error}=await db.from("member_deliveries").insert({title:d.title.trim(),body:d.body.trim()});feedback("#memberFeedback",error?error.message:"Exclusive delivery published to the locker.",!!error);if(!error)e.currentTarget.reset()});
(async()=>{if(!db){$("#adminLogin").classList.remove("hidden");return feedback("#adminLoginFeedback","First configure your Supabase URL and anon key in admin.js.",true)}const {data:{session}}=await db.auth.getSession();await requireAdmin(session?.user||null)})();