// Loaded after the Supabase CDN script and config.js
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Groups ----------
async function createGroup({ groupName, sponsorType, sponsorCompany, siteOrEvent, country, language, eventId }) {
  const { data, error } = await supabaseClient
    .from("groups")
    .insert({
      group_name: groupName,
      sponsor_type: sponsorType,
      sponsor_company: sponsorCompany,
      site_or_event: siteOrEvent,
      country: country,
      induction_language: language,
      event_id: eventId || null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Inductees ----------
async function createInductee(payload) {
  const { data, error } = await supabaseClient
    .from("inductees")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Certificates ----------
// Certificate numbers are scoped per event: MM-{EVENT_CODE}-0001, 0002, ...
// The sequence increment happens in the database (next_event_cert_sequence)
// so two people finishing at the same moment can never collide on a number.
// Falls back to a dated random number if somehow no event is set, so
// certificate generation never hard-fails.
function formatFallbackCertificateNumber() {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${CERT_PREFIX}-${year}-${rand}`;
}

async function createCertificate(inducteeId, event) {
  let certNumber;
  if (event && event.id && event.code) {
    const { data: seq, error: seqError } = await supabaseClient
      .rpc("next_event_cert_sequence", { p_event_id: event.id });
    if (seqError) throw seqError;
    const padded = String(seq).padStart(4, "0");
    certNumber = `${CERT_PREFIX}-${event.code}-${padded}`;
  } else {
    certNumber = formatFallbackCertificateNumber();
  }

  const { data, error } = await supabaseClient
    .from("certificates")
    .insert({
      inductee_id: inducteeId,
      certificate_number: certNumber,
      event_id: event ? event.id : null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Events ----------
// Only 'active' events are offered on the public induction flow.
async function getActiveEvents() {
  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .eq("status", "active")
    .order("event_date", { ascending: true });
  if (error) throw error;
  return data;
}

// All events, any status — used in the admin dashboard.
async function getAllEvents() {
  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function createEvent({ name, code, status, eventDate, location, country, brandColor, logoUrl }) {
  const { data, error } = await supabaseClient
    .from("events")
    .insert({
      name: name,
      code: code.toUpperCase().replace(/\s+/g, ""),
      status: status || "draft",
      event_date: eventDate || null,
      location: location || null,
      country: country || null,
      brand_color: brandColor || null,
      logo_url: logoUrl || null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateEvent(eventId, { brandColor, logoUrl }) {
  const payload = {};
  if (brandColor !== undefined) payload.brand_color = brandColor;
  if (logoUrl !== undefined) payload.logo_url = logoUrl;
  const { data, error } = await supabaseClient
    .from("events")
    .update(payload)
    .eq("id", eventId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Uploads a logo image file to the public "event-logos" Storage bucket
// and returns its public URL. Requires an authenticated (admin) session —
// see migration-event-branding.sql for the storage policies.
async function uploadEventLogo(file, eventCode) {
  const ext = file.name.split(".").pop().toLowerCase();
  const safeCode = (eventCode || "event").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const path = `${safeCode}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("event-logos")
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabaseClient.storage
    .from("event-logos")
    .getPublicUrl(path);
  return data.publicUrl;
}

async function updateEventStatus(eventId, status) {
  const { data, error } = await supabaseClient
    .from("events")
    .update({ status })
    .eq("id", eventId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Verification ----------
async function verifyByToken(token) {
  const { data, error } = await supabaseClient
    .from("certificates")
    .select(`
      id, certificate_number, qr_token, issued_at, valid, verified_count,
      inductees ( full_name, company_or_sponsor, site_or_event, induction_date ),
      events ( name, code, status, brand_color, logo_url )
    `)
    .eq("qr_token", token)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function verifyByCertificateNumber(certNumber) {
  const { data, error } = await supabaseClient
    .from("certificates")
    .select(`
      id, certificate_number, qr_token, issued_at, valid, verified_count,
      inductees ( full_name, company_or_sponsor, site_or_event, induction_date ),
      events ( name, code, status, brand_color, logo_url )
    `)
    .eq("certificate_number", certNumber.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function bumpVerifiedCount(certificateId, currentCount) {
  // best-effort — do not block the verification UI on this
  await supabaseClient
    .from("certificates")
    .update({ verified_count: (currentCount || 0) + 1, last_verified_at: new Date().toISOString() })
    .eq("id", certificateId);
}

// ---------- Induction topics ----------
async function getTopics(language) {
  const { data, error } = await supabaseClient
    .from("induction_topics")
    .select("*")
    .eq("language", language)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

// ---------- Topic quiz questions ----------
// Returns a map keyed by topic_key for quick lookup while stepping through topics.
async function getTopicQuestions(language) {
  const { data, error } = await supabaseClient
    .from("topic_questions")
    .select("*")
    .eq("language", language)
    .eq("active", true);
  if (error) throw error;
  const byTopicKey = {};
  (data || []).forEach(row => { byTopicKey[row.topic_key] = row; });
  return byTopicKey;
}

// ---------- Admin: search inductees ----------
// Server-side search (not just filtering already-loaded rows) so it still
// finds people even in datasets bigger than the default page limit.
// Searches name, ID/passport number, and company/sponsor.
async function searchInductees(searchTerm, limit) {
  const term = `%${searchTerm.trim()}%`;
  const { data, error } = await supabaseClient
    .from("inductees")
    .select(`
      *,
      events ( name, code )
    `)
    .or(`full_name.ilike.${term},id_or_passport_number.ilike.${term},company_or_sponsor.ilike.${term}`)
    .order("created_at", { ascending: false })
    .limit(limit || 200);
  if (error) throw error;
  return data;
}

// ---------- Admin: delete inductees ----------
// Certificates are linked with "on delete cascade" (see schema.sql), so
// deleting an inductee automatically removes their certificate too —
// no separate certificate-delete call needed.
async function deleteInductee(id) {
  const { error } = await supabaseClient
    .from("inductees")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function deleteInductees(ids) {
  if (!ids || ids.length === 0) return;
  const { error } = await supabaseClient
    .from("inductees")
    .delete()
    .in("id", ids);
  if (error) throw error;
}
