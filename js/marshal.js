/**
 * marshal.js — daily arrival check-in.
 *
 * Designed to work with NO connection at the gate:
 *   - the roster (who is allowed) and the event's PIN are downloaded once,
 *     while the phone has signal, and cached in localStorage;
 *   - every scan afterwards is checked against that local copy — no network
 *     call is needed to accept or reject a scan;
 *   - accepted scans go into a local queue and are uploaded in the
 *     background whenever the phone regains a connection.
 * Reopening this page later on the same phone (even offline) restores the
 * last event/roster from localStorage rather than starting blind.
 */

const LS_KEY = "mm_marshal_state_v1";

function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveState(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

let M = Object.assign({ eventId: null, eventName: null, pin: null, marshalName: "", roster: [], rosterAt: null, queue: [] }, loadState());

function todayLocal() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function arrivedTodaySet() {
  const today = todayLocal();
  return new Set(M.queue.filter(q => q.scan_date === today).map(q => q.inductee_id));
}

function refreshCounters() {
  document.getElementById("arrivedTodayCount").textContent = arrivedTodaySet().size;
  document.getElementById("pendingSyncCount").textContent = M.queue.filter(q => !q.synced).length;
  document.getElementById("rosterCount").textContent = M.roster.length;
  document.getElementById("pendingPill").classList.toggle("warn", M.queue.some(q => !q.synced));
  const ageEl = document.getElementById("rosterAge");
  if (ageEl) ageEl.textContent = M.rosterAt ? `List loaded ${new Date(M.rosterAt).toLocaleString()}` : "List not loaded yet";
}

// ---------- Step 1: events + gate ----------
async function loadEventOptions() {
  const sel = document.getElementById("eventSelect");
  try {
    const { data, error } = await supabaseClient.from("events").select("id,name,status").eq("status", "active").order("name");
    if (error) throw error;
    sel.innerHTML = "";
    (data || []).forEach(ev => {
      const opt = document.createElement("option");
      opt.value = ev.id; opt.textContent = ev.name;
      sel.appendChild(opt);
    });
    if (M.eventId && data.some(ev => ev.id === M.eventId)) sel.value = M.eventId;
    document.getElementById("gateOfflineNotice").classList.add("hidden");
    return true;
  } catch (e) {
    // Offline (or DB unreachable): fall back to the last event this phone used.
    sel.innerHTML = "";
    if (M.eventId) {
      const opt = document.createElement("option");
      opt.value = M.eventId; opt.textContent = M.eventName || "(last used event)";
      sel.appendChild(opt);
      document.getElementById("gateOfflineNotice").classList.remove("hidden");
      return true;
    }
    document.getElementById("gateError").textContent = "No connection, and no event has been loaded on this phone before. Connect to the internet once to set this phone up.";
    document.getElementById("gateError").classList.remove("hidden");
    return false;
  }
}

async function downloadRoster(eventId) {
  // Also refreshes the cached PIN for this event, since both come from the same trip online.
  const { data: ev, error: evErr } = await supabaseClient.from("events").select("id,name,marshal_pin").eq("id", eventId).single();
  if (evErr) throw evErr;
  const { data: roster, error: rErr } = await supabaseClient.from("marshal_roster").select("*").eq("event_id", eventId).eq("valid", true);
  if (rErr) throw rErr;
  M.eventId = ev.id; M.eventName = ev.name; M.pin = ev.marshal_pin;
  M.roster = roster || []; M.rosterAt = new Date().toISOString();
  saveState(M);
}

document.getElementById("gateSubmitBtn").addEventListener("click", async () => {
  const errEl = document.getElementById("gateError");
  errEl.classList.add("hidden");
  const eventId = document.getElementById("eventSelect").value;
  const pin = document.getElementById("marshalPinInput").value.trim();
  M.marshalName = document.getElementById("marshalNameInput").value.trim();

  if (!eventId) { errEl.textContent = "Choose an event."; errEl.classList.remove("hidden"); return; }

  // Try to refresh the roster for this event if we're online; if that fails,
  // fall back to whatever was already cached for this same event.
  let usedCache = false;
  try {
    await downloadRoster(eventId);
  } catch (e) {
    if (M.eventId === eventId && M.roster.length) {
      usedCache = true;
    } else {
      errEl.textContent = "Could not download the list for this event, and none is saved on this phone yet. Try again with a connection.";
      errEl.classList.remove("hidden");
      return;
    }
  }

  if (!M.pin || pin !== String(M.pin)) {
    errEl.textContent = "Incorrect PIN for this event.";
    errEl.classList.remove("hidden");
    return;
  }

  saveState(M);
  document.getElementById("scanOfflineNotice").classList.toggle("hidden", !usedCache);
  document.getElementById("stepGate").classList.add("hidden");
  document.getElementById("stepScan").classList.remove("hidden");
  refreshCounters();
});

document.getElementById("switchEventBtn").addEventListener("click", () => {
  document.getElementById("stepScan").classList.add("hidden");
  document.getElementById("stepGate").classList.remove("hidden");
  loadEventOptions();
});

document.getElementById("refreshRosterBtn").addEventListener("click", async () => {
  if (!M.eventId) return;
  try {
    await downloadRoster(M.eventId);
    document.getElementById("scanOfflineNotice").classList.add("hidden");
    refreshCounters();
  } catch (e) {
    document.getElementById("scanOfflineNotice").classList.remove("hidden");
  }
});

// ---------- Step 2: scanning ----------
function recordArrival(entry) {
  const today = todayLocal();
  const already = M.queue.some(q => q.inductee_id === entry.inductee_id && q.scan_date === today);
  if (already) {
    showResult("dup", `${entry.full_name}`, `${entry.company_or_sponsor} — already recorded as arrived today`);
    return;
  }
  M.queue.push({
    client_scan_id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
    event_id: M.eventId,
    inductee_id: entry.inductee_id,
    certificate_id: entry.certificate_id,
    scan_date: today,
    scanned_at: new Date().toISOString(),
    marshal_name: M.marshalName || null,
    synced: false
  });
  saveState(M);
  showResult("ok", `${entry.full_name}`, `${entry.company_or_sponsor} — arrival recorded`);
  refreshCounters();
  trySync();
}

function showResult(kind, title, sub) {
  const el = document.getElementById("scanResult");
  el.innerHTML = `<div class="m-status ${kind}">${escapeHtml(title)}<div class="sub">${escapeHtml(sub)}</div></div>`;
}
function escapeHtml(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function extractToken(text) {
  text = String(text || "").trim();
  try {
    const u = new URL(text);
    const tok = u.searchParams.get("token");
    if (tok && UUID_RE.test(tok)) return tok;
  } catch (e) { /* not a URL */ }
  if (UUID_RE.test(text)) return text;
  return null;
}

function handleScannedToken(token) {
  const entry = M.roster.find(r => r.qr_token === token);
  if (!entry) { showResult("bad", "Not recognised", "This QR code isn't on the downloaded list. Refresh the list if you have a connection, or check the certificate number."); return; }
  if (entry.event_id !== M.eventId) { showResult("bad", "Wrong event", "This certificate belongs to a different event."); return; }
  recordArrival(entry);
}

function handleManualNumber(number) {
  const entry = M.roster.find(r => (r.certificate_number || "").toUpperCase() === number.toUpperCase());
  // certificate_number isn't in marshal_roster by default — fall back gracefully.
  if (!entry) { showResult("bad", "Not found on the list", "Double-check the certificate number, or refresh the list if you have a connection."); return; }
  recordArrival(entry);
}

const scanner = createQrScanner({
  videoEl: document.getElementById("scanVideo"),
  canvasEl: document.getElementById("scanCanvas"),
  onStatus: (key) => {
    const el = document.getElementById("scanStatus");
    if (key === "error.cameraError") { el.textContent = "Could not access the camera."; document.getElementById("scanPanel").classList.add("hidden"); }
    else if (key === "error.cameraUnsupported") { el.textContent = "This browser can't open the camera."; }
    else if (key === "verify.scanning") { el.textContent = "Point the camera at the QR code."; }
    else { el.textContent = ""; }
  },
  onResult: (text) => {
    document.getElementById("scanPanel").classList.add("hidden");
    const token = extractToken(text);
    if (!token) { showResult("bad", "Not a certificate QR code", "That code isn't from this system."); return; }
    handleScannedToken(token);
  }
});

document.getElementById("scanBtn").addEventListener("click", async () => {
  document.getElementById("scanResult").innerHTML = "";
  document.getElementById("scanPanel").classList.remove("hidden");
  await scanner.start();
});
document.getElementById("scanStopBtn").addEventListener("click", () => { scanner.stop(); document.getElementById("scanPanel").classList.add("hidden"); });
document.getElementById("manualCheckBtn").addEventListener("click", () => {
  const v = document.getElementById("manualCertInput").value.trim();
  if (v) handleManualNumber(v);
});

// ---------- Background sync ----------
async function trySync() {
  const pending = M.queue.filter(q => !q.synced);
  if (!pending.length) return;
  for (const item of pending) {
    try {
      const { error } = await supabaseClient.from("attendance_scans").insert({
        event_id: item.event_id, inductee_id: item.inductee_id, certificate_id: item.certificate_id,
        scan_date: item.scan_date, scanned_at: item.scanned_at, marshal_name: item.marshal_name,
        client_scan_id: item.client_scan_id
      });
      // A conflict (already recorded — e.g. two devices scanned the same
      // person) still means the server has it: treat as synced, not a failure.
      if (!error || (error.code === "23505")) item.synced = true;
    } catch (e) {
      break; // still offline — stop for now, the periodic timer will retry
    }
  }
  saveState(M);
  refreshCounters();
  document.getElementById("scanOfflineNotice").classList.toggle("hidden", !M.queue.some(q => !q.synced) || navigator.onLine);
}

window.addEventListener("online", trySync);
setInterval(trySync, 20000);

// ---------- Boot ----------
(async () => {
  await loadEventOptions();
  refreshCounters();
  if (navigator.onLine) trySync();
})();
