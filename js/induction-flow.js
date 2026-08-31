// ============================================================
// Induction flow state machine
// Handles both "individual" and "group" inductions.
// For group inductions, each member still completes their own
// topics acknowledgement + signature + gets their own certificate,
// which is what makes each certificate individually verifiable.
// ============================================================

const params = new URLSearchParams(window.location.search);
const inductionType = params.get("type") === "group" ? "group" : "individual";

const state = {
  type: inductionType,
  language: getSavedOrDefaultLanguage(),
  selectedEvent: null,   // { id, name, code, status } — chosen on stepEvent, required before continuing
  sponsorType: "service_provider",
  companyOrSponsor: "",
  siteOrEvent: "",
  country: "Bahrain",
  groupName: "",
  groupId: null,
  members: [],          // [{fullName, idOrPassport, nationality, roleOrTrade, contactNumber}]
  currentMemberIndex: 0,
  topics: [],
  ackByTopic: {},
  sigPad: null,
  sigHasStroke: false,
  currentCertificate: null
};

const steps = ["stepEvent", "stepDetails", "stepMembers", "stepTopics", "stepSignature", "stepCertificate"];

function showStep(stepId) {
  steps.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("hidden", id !== stepId);
  });
  renderStepIndicator(stepId);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderStepIndicator(activeId) {
  const flow = state.type === "group"
    ? ["stepEvent", "stepDetails", "stepMembers", "stepTopics", "stepSignature", "stepCertificate"]
    : ["stepEvent", "stepDetails", "stepTopics", "stepSignature", "stepCertificate"];
  const wrap = document.getElementById("stepIndicator");
  wrap.innerHTML = "";
  flow.forEach(id => {
    const dot = document.createElement("div");
    dot.className = "step-dot" + (id === activeId ? " active" : "");
    wrap.appendChild(dot);
  });
}

// ---------- Event branding ----------
// Sets the master --brand-primary and --brand-accent variables used
// everywhere in this stylesheet (header/text/progress dots use primary;
// buttons/CTAs/hover states use accent) so once an event is selected,
// the whole induction flow reflects that event's own two marketing
// brand colours rather than Miraj Media's defaults. Resets to the
// defaults while browsing the event list itself, since no specific
// event is "active" yet at that point.
const DEFAULT_BRAND_PRIMARY = "#1A347E";
const DEFAULT_BRAND_ACCENT = "#F15E2C";
function applyEventBranding(primary, accent) {
  document.documentElement.style.setProperty("--brand-primary", primary || DEFAULT_BRAND_PRIMARY);
  document.documentElement.style.setProperty("--brand-accent", accent || DEFAULT_BRAND_ACCENT);
}

// ---------- Step: Event selection ----------
async function goToEventStep() {
  showStep("stepEvent");
  applyEventBranding(null, null); // reset to Miraj defaults while choosing an event
  const list = document.getElementById("eventList");
  const noneMsg = document.getElementById("noActiveEvents");
  noneMsg.classList.add("hidden");
  list.innerHTML = `<div class="spinner"></div>`;

  try {
    const events = await getActiveEvents();
    list.innerHTML = "";
    if (!events || events.length === 0) {
      noneMsg.classList.remove("hidden");
      return;
    }
    events.forEach(ev => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "event-option";
      card.style.setProperty("--event-accent", ev.brand_color || DEFAULT_BRAND_PRIMARY);
      let dateStr = "";
      if (ev.event_start && ev.event_end && ev.event_start !== ev.event_end) {
        dateStr = `${new Date(ev.event_start).toLocaleDateString()} \u2013 ${new Date(ev.event_end).toLocaleDateString()}`;
      } else if (ev.event_start) {
        dateStr = new Date(ev.event_start).toLocaleDateString();
      } else if (ev.event_end) {
        dateStr = new Date(ev.event_end).toLocaleDateString();
      }
      const logoHtml = ev.logo_url
        ? `<img src="${ev.logo_url}" alt="" class="event-option-logo">`
        : "";
      card.innerHTML = `
        <div class="event-option-header">
          ${logoHtml}
          <div>
            <span class="event-option-name">${ev.name}</span><br>
            <span class="event-option-meta">${[ev.location, dateStr].filter(Boolean).join(" \u00b7 ")}</span>
          </div>
        </div>
      `;
      card.addEventListener("click", () => {
        state.selectedEvent = {
          id: ev.id, name: ev.name, code: ev.code, status: ev.status,
          brandColor: ev.brand_color || null,
          brandColorAccent: ev.brand_color_accent || null,
          logoUrl: ev.logo_url || null
        };
        state.siteOrEvent = ev.name; // keeps the CSV/admin table and certificate text working unchanged
        applyEventBranding(ev.brand_color, ev.brand_color_accent);
        goToDetailsStep();
      });
      list.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    list.innerHTML = `<p style="color:#C0392B;">Could not load events. Check your connection and reload.</p>`;
  }
}

function goToDetailsStep() {
  showStep("stepDetails");
}

document.getElementById("backToEventBtn").addEventListener("click", () => {
  goToEventStep();
});

// ---------- Sponsor type radios ----------
function renderSponsorTypeRadios() {
  const group = document.getElementById("sponsorTypeGroup");
  const options = ["service_provider", "contractor", "sponsor", "client_staff", "other"];
  group.innerHTML = "";
  options.forEach((opt, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "radio-pill";
    wrap.innerHTML = `
      <input type="radio" name="sponsorType" id="sp_${opt}" value="${opt}" ${idx === 0 ? "checked" : ""}>
      <label for="sp_${opt}" data-i18n="sponsorType.${opt}"></label>
    `;
    group.appendChild(wrap);
  });
  applyStrings();
}

// ---------- Step: Details ----------
function initDetailsStep() {
  document.getElementById("groupOnlyFields").classList.toggle("hidden", state.type !== "group");
  document.getElementById("individualOnlyFields").classList.toggle("hidden", state.type === "group");
  document.getElementById("detailsHeading").setAttribute("data-i18n", state.type === "group" ? "home.groupBtn" : "home.individualBtn");
  applyStrings();
}

function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach(e => e.classList.remove("show"));
}

document.getElementById("detailsNextBtn").addEventListener("click", () => {
  clearFieldErrors();
  let valid = true;

  const companyOrSponsor = document.getElementById("companyOrSponsor").value.trim();
  if (!companyOrSponsor) {
    document.getElementById("err-companyOrSponsor").classList.add("show");
    valid = false;
  }

  state.sponsorType = document.querySelector('input[name="sponsorType"]:checked').value;
  state.companyOrSponsor = companyOrSponsor;
  state.country = document.getElementById("country").value;

  if (state.type === "group") {
    state.groupName = document.getElementById("groupName").value.trim();
    if (!state.groupName) valid = false;
  } else {
    const fullName = document.getElementById("fullName").value.trim();
    const idOrPassport = document.getElementById("idOrPassport").value.trim();
    if (!fullName) { document.getElementById("err-fullName").classList.add("show"); valid = false; }
    if (!idOrPassport) { document.getElementById("err-idOrPassport").classList.add("show"); valid = false; }

    if (valid) {
      state.members = [{
        fullName,
        idOrPassport,
        nationality: document.getElementById("nationality").value.trim(),
        roleOrTrade: document.getElementById("roleOrTrade").value.trim(),
        contactNumber: document.getElementById("contactNumber").value.trim()
      }];
    }
  }

  if (!valid) return;

  if (state.type === "group") {
    if (state.members.length === 0) addMemberRow();
    showStep("stepMembers");
  } else {
    goToTopicsForCurrentMember();
  }
});

// ---------- Step: Group members ----------
function addMemberRow() {
  state.members.push({ fullName: "", idOrPassport: "", nationality: "", roleOrTrade: "", contactNumber: "" });
  renderMembersList();
}

function renderMembersList() {
  const list = document.getElementById("membersList");
  list.innerHTML = "";
  state.members.forEach((m, idx) => {
    const row = document.createElement("div");
    row.className = "card";
    row.style.marginBottom = "12px";
    row.innerHTML = `
      <label data-i18n="form.fullName"></label>
      <input type="text" data-field="fullName" data-idx="${idx}" value="${m.fullName}">
      <label data-i18n="form.idOrPassport"></label>
      <input type="text" data-field="idOrPassport" data-idx="${idx}" value="${m.idOrPassport}">
      <label data-i18n="form.nationality"></label>
      <input type="text" data-field="nationality" data-idx="${idx}" value="${m.nationality}">
      <label data-i18n="form.roleOrTrade"></label>
      <input type="text" data-field="roleOrTrade" data-idx="${idx}" value="${m.roleOrTrade}">
      ${state.members.length > 1 ? `<button class="btn btn-outline" data-remove="${idx}" data-i18n="form.removeMember" style="margin-top:10px;"></button>` : ""}
    `;
    list.appendChild(row);
  });
  applyStrings();

  list.querySelectorAll("input[data-field]").forEach(input => {
    input.addEventListener("input", (e) => {
      const idx = parseInt(e.target.getAttribute("data-idx"), 10);
      const field = e.target.getAttribute("data-field");
      state.members[idx][field] = e.target.value;
    });
  });
  list.querySelectorAll("button[data-remove]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.getAttribute("data-remove"), 10);
      state.members.splice(idx, 1);
      renderMembersList();
    });
  });
}

document.getElementById("addMemberBtn").addEventListener("click", addMemberRow);

document.getElementById("membersNextBtn").addEventListener("click", () => {
  const valid = state.members.length > 0 && state.members.every(m => m.fullName.trim() && m.idOrPassport.trim());
  if (!valid) {
    alert(t("form.required"));
    return;
  }
  state.currentMemberIndex = 0;
  goToTopicsForCurrentMember();
});

// ---------- Step: Topics (sequential, one topic at a time, quiz-gated) ----------
// Each topic must be read AND its comprehension question answered correctly
// before the next topic unlocks. A wrong answer flashes red and the same
// question stays on screen — it does not advance. A correct answer flashes
// green and moves on automatically. This is what marks a topic "acknowledged"
// (state.ackByTopic), replacing the old plain checkbox.
async function goToTopicsForCurrentMember() {
  showStep("stepTopics");
  const list = document.getElementById("topicsList");
  list.innerHTML = `<div class="spinner"></div>`;
  document.getElementById("quizBlock").classList.add("hidden");
  state.ackByTopic = {};
  state.currentTopicIndex = 0;

  try {
    let topics = await getTopics(state.language);
    let questions = await getTopicQuestions(state.language);
    if (!topics || topics.length === 0) {
      topics = await getTopics("en");
      questions = await getTopicQuestions("en");
    }
    state.topics = topics;
    state.quizByTopicKey = questions;
    renderCurrentTopic();
  } catch (err) {
    list.innerHTML = `<p style="color:#C0392B;">Could not load induction topics. Check your connection and reload.</p>`;
    console.error(err);
  }
}

function renderTopicProgress() {
  const wrap = document.getElementById("topicProgress");
  wrap.innerHTML = "";
  state.topics.forEach((t, idx) => {
    const dot = document.createElement("div");
    dot.className = "topic-progress-dot"
      + (idx < state.currentTopicIndex ? " done" : "")
      + (idx === state.currentTopicIndex ? " active" : "");
    wrap.appendChild(dot);
  });
}

function renderCurrentTopic() {
  renderTopicProgress();
  const topic = state.topics[state.currentTopicIndex];
  const list = document.getElementById("topicsList");
  list.innerHTML = `
    <div class="topic">
      <h3>${topic.title}</h3>
      <p>${topic.body}</p>
    </div>
  `;
  applyStrings();
  renderQuizForTopic(topic);
}

function renderQuizForTopic(topic) {
  const quiz = state.quizByTopicKey ? state.quizByTopicKey[topic.topic_key] : null;
  const block = document.getElementById("quizBlock");
  const feedback = document.getElementById("quizFeedback");

  if (!quiz) {
    // No question configured for this topic yet — don't block progress.
    block.classList.add("hidden");
    markTopicAcknowledgedAndAdvance(topic, { auto: true });
    return;
  }

  block.classList.remove("hidden");
  feedback.classList.add("hidden");
  feedback.textContent = "";
  document.getElementById("quizQuestion").textContent = quiz.question_text;

  // Randomise left/right placement each time this topic's quiz is shown,
  // so the correct answer is never in a predictable position.
  const correctOnLeft = Math.random() < 0.5;
  const slots = [
    { el: "A", isCorrect: correctOnLeft },
    { el: "B", isCorrect: !correctOnLeft },
  ];

  slots.forEach(slot => {
    const text = slot.isCorrect ? quiz.correct_answer_text : quiz.incorrect_answer_text;
    const img = slot.isCorrect ? quiz.correct_image_url : quiz.incorrect_image_url;
    const btn = document.getElementById(`quizAnswer${slot.el}`);
    document.getElementById(`quizText${slot.el}`).textContent = text;
    const imgEl = document.getElementById(`quizImage${slot.el}`);
    imgEl.src = quiz.correct_image_url && quiz.incorrect_image_url ? img : "";
    imgEl.alt = text;
    btn.classList.remove("flash-correct", "flash-incorrect", "disabled-answer");
    btn.disabled = false;
    btn.onclick = () => handleQuizAnswer(topic, slot.isCorrect, btn);
  });
}

function handleQuizAnswer(topic, isCorrect, btnEl) {
  const feedback = document.getElementById("quizFeedback");
  const allBtns = [document.getElementById("quizAnswerA"), document.getElementById("quizAnswerB")];

  if (isCorrect) {
    btnEl.classList.add("flash-correct");
    allBtns.forEach(b => { b.disabled = true; });
    feedback.classList.remove("hidden");
    feedback.classList.remove("feedback-incorrect");
    feedback.classList.add("feedback-correct");
    feedback.setAttribute("data-i18n", "quiz.correct");
    applyStrings();
    setTimeout(() => markTopicAcknowledgedAndAdvance(topic, { auto: false }), 700);
  } else {
    btnEl.classList.remove("flash-incorrect");
    // restart the flash animation even on repeated wrong clicks
    void btnEl.offsetWidth;
    btnEl.classList.add("flash-incorrect");
    feedback.classList.remove("hidden");
    feedback.classList.remove("feedback-correct");
    feedback.classList.add("feedback-incorrect");
    feedback.setAttribute("data-i18n", "quiz.incorrect");
    applyStrings();
    // Question stays on screen — the correct answer remains clickable.
  }
}

function markTopicAcknowledgedAndAdvance(topic) {
  state.ackByTopic[topic.id] = true;
  if (state.currentTopicIndex < state.topics.length - 1) {
    state.currentTopicIndex += 1;
    renderCurrentTopic();
    document.getElementById("stepTopics").scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    document.getElementById("quizBlock").classList.add("hidden");
    showStep("stepSignature");
    initSignaturePad();
  }
}

// ---------- Step: Signature ----------
function initSignaturePad() {
  const canvas = document.getElementById("sigPad");
  const ctx = canvas.getContext("2d");

  // High-DPI aware sizing
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#1A1A1A";
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  state.sigHasStroke = false;
  let drawing = false;
  let last = null;

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - r.left, y: point.clientY - r.top };
  }

  function start(e) {
    e.preventDefault();
    drawing = true;
    last = getPos(e);
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    last = pos;
    state.sigHasStroke = true;
  }
  function end(e) {
    drawing = false;
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  state.sigPad = canvas;

  document.getElementById("clearSigBtn").onclick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.sigHasStroke = false;
  };
}

document.getElementById("submitBtn").addEventListener("click", async () => {
  document.getElementById("err-signature").classList.remove("show");
  if (!state.sigHasStroke) {
    document.getElementById("err-signature").classList.add("show");
    return;
  }
  await submitCurrentMember();
});

// ---------- Submit + generate certificate ----------
async function submitCurrentMember() {
  showStep("stepCertificate");
  document.getElementById("certGenerating").classList.remove("hidden");
  document.getElementById("certResult").classList.add("hidden");
  document.getElementById("certError").classList.add("hidden");

  try {
    // Ensure group exists (create once, reuse for all members)
    if (state.type === "group" && !state.groupId) {
      const group = await createGroup({
        groupName: state.groupName,
        sponsorType: state.sponsorType,
        sponsorCompany: state.companyOrSponsor,
        siteOrEvent: state.siteOrEvent,
        country: state.country,
        language: state.language,
        eventId: state.selectedEvent ? state.selectedEvent.id : null
      });
      state.groupId = group.id;
    }

    const member = state.members[state.currentMemberIndex];
    const signatureDataUrl = state.sigPad.toDataURL("image/png");

    const inductee = await createInductee({
      group_id: state.type === "group" ? state.groupId : null,
      full_name: member.fullName,
      id_or_passport_number: member.idOrPassport,
      nationality: member.nationality || null,
      company_or_sponsor: state.companyOrSponsor,
      sponsor_type: state.sponsorType,
      role_or_trade: member.roleOrTrade || null,
      contact_number: member.contactNumber || null,
      site_or_event: state.siteOrEvent || null,
      event_id: state.selectedEvent ? state.selectedEvent.id : null,
      country: state.country,
      induction_language: state.language,
      acknowledged_topics: Object.keys(state.ackByTopic).filter(k => state.ackByTopic[k]),
      signature_data: signatureDataUrl
    });

    const certificate = await createCertificate(inductee.id, state.selectedEvent);
    state.currentCertificate = { certificate, inductee, member };

    await renderCertificateResult(certificate, inductee, member);

  } catch (err) {
    console.error("Certificate generation failed:", err);
    document.getElementById("certGenerating").classList.add("hidden");
    document.getElementById("certError").classList.remove("hidden");
  }
}

async function renderCertificateResult(certificate, inductee, member) {
  const verifyUrl = buildVerifyUrl(certificate.qr_token);
  const issuedDateStr = new Date(certificate.issued_at).toLocaleDateString();

  const certBox = document.getElementById("certBox");
  const certLogo = document.getElementById("certLogo");
  const primaryColor = state.selectedEvent ? state.selectedEvent.brandColor : null;
  certBox.style.setProperty("--event-accent", primaryColor || "#1A347E");
  if (state.selectedEvent && state.selectedEvent.logoUrl) {
    certLogo.src = state.selectedEvent.logoUrl;
    certLogo.classList.remove("hidden");
  } else {
    certLogo.classList.add("hidden");
    certLogo.removeAttribute("src");
  }

  document.getElementById("certName").textContent = member.fullName;
  document.getElementById("certNumber").textContent = certificate.certificate_number;
  document.getElementById("certDate").textContent = issuedDateStr;

  try {
    await generateAndDownloadCertificate({
      containerEl: document.getElementById("qrCanvas"),
      verifyUrl,
      fullName: member.fullName,
      certNumber: certificate.certificate_number,
      issuedDateStr,
      statementText: t("certificate.statement"),
      titleText: t("certificate.title"),
      brandName: BRAND.name,
      eventColor: primaryColor,
      eventAccentColor: state.selectedEvent ? state.selectedEvent.brandColorAccent : null,
      eventLogoUrl: state.selectedEvent ? state.selectedEvent.logoUrl : null
    });

    document.getElementById("certGenerating").classList.add("hidden");
    document.getElementById("certResult").classList.remove("hidden");

    const isLastMember = state.currentMemberIndex >= state.members.length - 1;
    const nextBtn = document.getElementById("nextMemberBtn");
    const doneLink = document.getElementById("doneLink");
    if (state.type === "group" && !isLastMember) {
      nextBtn.classList.remove("hidden");
      doneLink.classList.add("hidden");
    } else {
      nextBtn.classList.add("hidden");
      doneLink.classList.remove("hidden");
    }
  } catch (err) {
    console.error("PDF/QR generation failed:", err);
    document.getElementById("certGenerating").classList.add("hidden");
    document.getElementById("certError").classList.remove("hidden");
  }
}

document.getElementById("retryCertBtn").addEventListener("click", () => {
  document.getElementById("certError").classList.add("hidden");
  document.getElementById("certGenerating").classList.remove("hidden");
  if (state.currentCertificate) {
    const { certificate, inductee, member } = state.currentCertificate;
    renderCertificateResult(certificate, inductee, member);
  } else {
    submitCurrentMember();
  }
});

document.getElementById("nextMemberBtn").addEventListener("click", () => {
  state.currentMemberIndex += 1;
  state.currentCertificate = null;
  goToTopicsForCurrentMember();
});

// ---------- Language switcher (shared) ----------
function buildLangSwitcher() {
  const sel = document.getElementById("langSelect");
  sel.innerHTML = "";
  SUPPORTED_LANGUAGES.forEach(code => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = code.toUpperCase();
    sel.appendChild(opt);
  });
  sel.value = state.language;
  sel.addEventListener("change", async () => {
    state.language = sel.value;
    await loadLanguage(sel.value);
    renderSponsorTypeRadios();
    initDetailsStep();
  });
}

// ---------- Init ----------
(async () => {
  buildLangSwitcher();
  await loadLanguage(state.language);
  renderSponsorTypeRadios();
  initDetailsStep();
  goToEventStep();
})();
