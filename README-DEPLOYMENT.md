# Miraj Media Safety Induction Portal — Setup & Deployment

Standalone induction portal for Miraj Media (Bahrain/Gulf + African labour).
Languages: English, Arabic (RTL), French, Swahili.
No coding required beyond copy/paste — follow the steps in order.

---

## 1. Set up Supabase (the database)

1. Go to supabase.com and create a **new project** (call it something like `miraj-induction`).
2. Once it's created, go to **SQL Editor > New query**.
3. Open `supabase/schema.sql` from this folder, copy the whole contents, paste into the SQL editor, and click **Run**.
   - This creates all the tables AND disables Row Level Security on each one (required — see the recurring RLS note below).
   - It also seeds six starter English induction topics (Welcome, PPE, Emergency Procedures, Incident Reporting, Access Control, Code of Conduct) carried over from the IMPI portal structure. **Add the Arabic/French/Swahili versions of these topics** (and swap in Miraj Media's real content) via **Table Editor > induction_topics** once you have final content — just duplicate a row and change `language` + `title` + `body`.
   - This also creates the **`topic_questions`** table for the per-topic quiz (see section 2b below) and the **`events`** table for per-event management (see section 2d below).

   > **Already have a Supabase project running from before the events feature was added?** Don't re-run all of `schema.sql` — just run `supabase/migration-events.sql` instead. It only adds the new `events` table and the columns that link to it, safe to run on top of your existing data.
4. Run `supabase/update-topics-international.sql` — this replaces the six placeholder topics with the 18 real Miraj Media international induction topics (11 safety, 3 security, 4 general compliance — see the breakdown just below).
5. Run `supabase/topic_questions_content.sql` — this loads all 18 quiz questions in all 4 languages (72 rows total). Do this **after** the app (with the `assets/quiz/` images) is deployed, since the rows point at relative image paths like `assets/quiz/ppe_correct.jpg`.
6. Go to **Project Settings > API**. Copy:
   - **Project URL**
   - **anon public key**
7. Open `js/config.js` in this folder and paste them in:
   ```js
   const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
   const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
   ```
8. **Create your admin login**: Supabase Dashboard > **Authentication > Users > Add user** — enter your email and a password. That's what you'll use to log into `admin.html`.
9. **Add at least one event with status "Active"** before testing the induction flow — go to `admin.html` > Events tab > Add Event. The public induction flow only shows events marked Active; Draft and Completed events are hidden from the picker on purpose.

**Important — RLS reminder:** if you ever add a new table later (e.g. for extra content), it will have Row Level Security turned ON by default, and the app will silently get zero rows back. Run `ALTER TABLE [table_name] DISABLE ROW LEVEL SECURITY;` in the SQL Editor for any new table, same as on the other IMPI Supabase projects.

---

## 1b. How events work

Every induction is now tied to a specific event, not just a free-text field:

- **Admin (`admin.html` > Events tab):** add an event with a name, a short **code** (e.g. `DXB25` — keep it short, this becomes part of every certificate number issued for that event), a date, a location, and a status. Change the status anytime from the same table — no page reload needed.
- **Status meaning:** `Draft` = not yet visible to anyone doing an induction (use this while you're setting an event up). `Active` = shows up on the public induction flow's event picker. `Completed` = hidden from the picker again, for events that have wrapped — but all its data and certificates stay intact and still verify correctly.
- **Public flow:** the very first screen of both the individual and group induction flow is now "Select Your Event," listing only Active events. If there are none, it shows a friendly message rather than a broken page.
- **Certificate numbers:** each event gets its own clean numbering run — `MM-DXB25-0001`, `MM-DXB25-0002`, and so on — instead of one shared sequence across every event ever run. The counter lives in the database and increments atomically, so two people finishing at the exact same moment can never end up with the same number.
- **Admin search (Inductees tab):** search by name, ID/passport number, or company — searches the database directly rather than just filtering what's already on screen, so it still finds people even as the dataset grows past what's shown by default.
- **Verification (`verify.html`):** already existed from earlier in the build — now shows the actual linked event name (via the `events` table) rather than the old free-text field.

---

## 2. The 18 induction topics (safety-first structure)

Rebalanced from the original 13-topic draft, which skewed too security-heavy for a *safety*
induction. Code of Conduct was folded into the Welcome topic rather than kept standalone.

**Safety (11):** PPE & Uniform Standards · Manual Handling & Lifting Techniques · Working at
Height, Ladders & Rigging Safety · Electrical Safety & Temporary Power · Slips, Trips & Falls
Prevention · Vehicle, Forklift & Loading Bay Safety · Heat Stress, Hydration & Personal Wellbeing
· First Aid & Medical Emergency Response · Emergency Procedures, Evacuation & Fire Safety ·
Incident, Hazard & Near-Miss Reporting · Crowd Management & Public Safety

**Security (3):** Access Control, Accreditation & Site Zoning · Use of Force, De-escalation &
Search Procedures · Communication Protocols & Chain of Command

**General compliance (4):** Welcome & Purpose (incl. Code of Conduct) · Cultural & Legal
Compliance for International Deployment · Data Protection & Media Confidentiality · Anti-Bribery,
Corruption & Zero-Tolerance Policy

Full wording for all 18 is in `Miraj-Media-Induction-Content-Draft.docx` and
`supabase/update-topics-international.sql`.

---

## 2b. How the topic quiz works

Each of the 18 topics now has a comprehension question attached (`topic_questions` table), shown one topic at a time:

- The person reads the topic, then answers a question with two options — the app doesn't reveal which is correct, and left/right position is shuffled every time the question loads.
- **Wrong answer:** the button flashes red and the question stays on screen. They can simply pick the other option — there's no separate "retry" step.
- **Correct answer:** the button flashes green and the app automatically moves to the next topic after a short pause.
- **Every answer has its own image** — one showing the correct practice, one showing the incorrect practice — so the picture itself helps make the right choice obvious, not just the wording. Images are full-width and never cropped, on any screen size (this specifically fixes the photo-cropping bug from the old IMPI induction portal on mobile).
- All question/answer text is pulled from Supabase per language, same pattern as the topics themselves — so it follows the language switcher automatically.
- Images live in `assets/quiz/` (36 files, ~76KB average, JPEG). These are AI-generated photorealistic images (Windows Designer), not photos of real people, so there's no consent/likeness issue — but they were **not shot by Miraj Media**, so don't present them as real site photography if that ever matters contractually.
- If a topic has no question row yet (e.g. you add a 14th topic later without a matching quiz), the app just skips the quiz for that topic and moves on — it won't block anyone.
- **AR/FR/SW quiz text is a working draft**, same caveat as the rest of the translated content — get a native speaker to review before real go-live.

---

## 2c. Branding — already applied

This is now built with Miraj Media's real branding, pulled from their logo file and mirajmedia.com:

- **Logo:** `assets/logo-miraj.png` (background made transparent so it sits cleanly on the white header)
- **Navy** `#1A347E` (from the logo's bird/swoosh icon) — used as the primary colour, header border, and buttons
- **Orange** `#F15E2C` (from the "miraj" wordmark) — used as the accent colour (Group Induction button, etc.)
- **Company details:** info@mirajmedia.com / www.mirajmedia.com, offices in Dubai (HQ), Al Khobar (Saudi Arabia), and Manama (Bahrain) — all in `js/config.js` under `BRAND`

If Miraj Media later supplies an official vector logo (SVG/AI) or a formal brand guideline, swap `assets/logo-miraj.png` for that and adjust `BRAND.primaryColor` / `BRAND.accentColor` in `js/config.js` and the matching `--brand-primary` / `--brand-accent` variables at the top of `css/styles.css` to match exactly — what's here now was colour-picked directly from their logo file, which is a close but not guaranteed pixel-perfect match to their official brand palette.

---

## 3. Deploy to GitHub Pages (free)

1. Go to github.com, log in as **ShaneIMPI**.
2. Create a **new repository** — suggest `miraj-induction-portal` — set to **Public** (GitHub Pages free tier needs public for personal accounts).
3. Upload every file and folder from this project **keeping the folder structure exactly as-is** (`css/`, `js/`, `lang/`, `assets/`, `supabase/`, plus the `.html` files at the root). Easiest way: use **github.dev** (press `.` while viewing the repo in your browser) and drag the whole folder in, or use "Add file > Upload files" and upload folder-by-folder.
4. Go to **Settings > Pages**.
5. Under **Build and deployment > Source**, choose **Deploy from a branch**.
6. Branch: `main`, folder: `/ (root)`. Save.
7. Wait 1–2 minutes, then your portal will be live at:
   `https://shaneimpi.github.io/miraj-induction-portal/`

This is a plain static site (no build step, no GitHub Actions needed) — simpler than the Event Plan Generator and Job Cards deploys.

---

## 4. Test before the demo

Run through this checklist on an actual phone (not just desktop browser resized):

- [ ] Switch language to Arabic and confirm the whole layout flips to right-to-left correctly
- [ ] Complete a full **individual** induction end to end, confirm the certificate PDF downloads with a working QR code
- [ ] Scan the QR code with a phone camera — confirm it opens `verify.html` and shows "VALID CERTIFICATE" with the right name
- [ ] Complete a full **group** induction with 2–3 members, confirm each member gets their own separate certificate
- [ ] Log into `admin.html` with your Supabase user and confirm the inductee list and CSV export both work
- [ ] Test on a slow/throttled mobile connection if possible — this is exactly the scenario where the old portal's certificate generation was unreliable. The retry button on the certificate screen is there specifically for this; confirm it works if you force a failure (e.g. by turning off wifi mid-generation).

---

## 5. What's still placeholder / needs your input

- **Branding** — done (see step 2). If Miraj Media's marketing team provides an official brand guideline later, double-check the colours match exactly.
- **Induction content** — an international events/security-specific draft has been written (see `Miraj-Media-Induction-Content-Draft.docx`) and the SQL to load it is in `supabase/update-topics-international.sql`. Review it, then run that file in the Supabase SQL Editor before the demo.
- **Arabic / French / Swahili translations** — the UI text (buttons, labels, certificate wording) has been translated as a starting draft. Flagged in each `lang/*.json` file with a `reviewNote` — **have a native speaker of each language check these before the real go-live**, since this is safety-critical content. Fine for the demo.
- **Topic quiz questions (AR/FR/SW)** — the 18 comprehension questions in `supabase/topic_questions_content.sql` are translated as a working draft, same review caveat as above. The 36 illustration images themselves have no text in them, so they don't need translation.
- **Admin users** — you'll need to create a Supabase Auth user for anyone else who needs admin access (Table Editor won't do this — use Authentication > Users)
- **Events** — no events exist until you add them. Before the demo, add at least one real event via `admin.html` > Events tab and set it to **Active**, or the induction flow's first screen will just show "no active events right now."

---

## 6. If Miraj Media wants to run it themselves

Since everything lives in Supabase + a static site, handover is straightforward:
- Transfer or duplicate the Supabase project into their own account, OR give them a read/write export of the data
- Transfer the GitHub repo to their GitHub org, or give them the files to redeploy on their own hosting
- No server, no functions, no ongoing dependency on your accounts

If they want features that need serverless functions later (e.g. automated email confirmations), we'd add a Netlify Functions layer at that point — same pattern as the IMPI Response Hub — but it's not needed for the current scope.
