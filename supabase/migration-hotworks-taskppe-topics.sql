-- ============================================================
-- Migration: two new topics (Hot Works, Task-Specific PPE)
-- + updated Working at Height and PPE content
-- ============================================================
-- Run this once in Supabase SQL Editor (Project > SQL Editor > New query)
-- on your EXISTING project. Safe to re-run.
--
-- What this does:
--   1. Updates the existing "working_at_height" and "ppe" topics
--      (English) with expanded content — authorised operators for
--      aerial lifts/cherry pickers, permits/licences, no moving
--      scaffolds with people on them, working-at-height certification,
--      and reinforced always-on PPE requirements.
--   2. Adds two brand-new topics at sort_order 19 and 20:
--        - hot_works   : Hot Works & Restricted Activities
--        - task_ppe    : Task-Specific PPE Requirements
--   3. Adds matching quiz questions for the two new topics.
--
-- IMPORTANT — this only covers English and Arabic. French and
-- Swahili content for the two new topics still needs to be written
-- and added separately (same as the existing native-review caveat
-- that already applies to the rest of the Arabic/French/Swahili
-- content in this app).
--
-- IMPORTANT — the quiz images referenced below (hotworks_correct.jpg,
-- hotworks_incorrect.jpg, taskppe_correct.jpg, taskppe_incorrect.jpg)
-- are PLACEHOLDER images until real photos are generated and swapped
-- in at assets/quiz/. The topics will work and display correctly with
-- placeholders — just re-upload the real files under those exact
-- filenames once ready and no further changes are needed.
-- ============================================================

-- ---------- 0. Add missing safety net ----------
-- induction_topics didn't have a unique constraint on (topic_key, language)
-- the way topic_questions does — without it, "on conflict do nothing" below
-- wouldn't actually prevent duplicate rows if this migration were ever run
-- twice. Adding it now, safe even if it already exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'induction_topics_topic_lang_unique'
  ) then
    alter table induction_topics
      add constraint induction_topics_topic_lang_unique unique (topic_key, language);
  end if;
end $$;

-- ---------- 1. Update existing topics (English) ----------

update induction_topics
set body = 'Any work above ground level — including on ladders, scaffolding, truss, rigging platforms, or aerial work platforms — carries a fall risk and must only be carried out by personnel authorised and trained for that specific task. Ladders must be inspected before use, placed on stable, level ground, and never used as a substitute for proper access equipment on a prolonged task. Aerial lifts, cherry pickers, and other mobile elevating work platforms may only be operated by drivers holding a current, valid authorisation — unauthorised personnel must never operate this equipment, and all relevant permits and licences must be in place and available on request before work begins. Scaffolds must never be moved, wheeled, or repositioned while anyone remains on the working platform. Rigging, trussing, and suspended loads must only be handled by qualified riggers under a documented rigging plan — no one else may work beneath a suspended load or an active rigging point. Except for basic ladder work, anyone working at height must hold a valid working-at-height certificate, and fall-arrest equipment, where required by the site risk assessment, must be worn correctly and inspected before each use.'
where topic_key = 'working_at_height' and language = 'en';

update induction_topics
set body = 'The correct uniform and accreditation must be worn visibly at all times while on duty. Three items are mandatory at all times, no exceptions: a hard hat, a high-visibility vest, and safety shoes. Where the risk assessment for a specific site or task requires additional PPE beyond these three — such as hearing protection, eye protection, gloves, or respiratory protection — this will be issued and is mandatory for that task; see Task-Specific PPE Requirements for common examples. Damaged or missing PPE must be reported to your supervisor before starting work, not after.'
where topic_key = 'ppe' and language = 'en';

-- ---------- 2. New topics (English + Arabic) ----------

insert into induction_topics (topic_key, language, sort_order, title, body) values
('hot_works', 'en', 19, 'Hot Works & Restricted Activities', 'Sanding, cutting, grinding, welding, and any other hot works are strictly prohibited inside exhibition halls or any enclosed public area. These activities create sparks, dust, fumes, or open flame that pose a fire and health hazard in occupied spaces. All such work must be carried out only in the designated hot works area, using appropriate fire watch and extinguishing equipment as required by the site''s hot works permit system. If you are unsure whether your task counts as hot work, or where the designated area is located, ask your supervisor before starting.'),
('hot_works', 'ar', 19, 'الأعمال الساخنة والأنشطة المقيّدة', 'يُمنع منعاً باتاً القيام بأعمال الصنفرة أو القطع أو الجلخ أو اللحام أو أي أعمال ساخنة أخرى داخل صالات المعارض أو أي منطقة عامة مغلقة. تُنتج هذه الأنشطة شرراً أو غباراً أو أبخرة أو لهباً مكشوفاً يشكّل خطراً على السلامة والصحة في الأماكن المأهولة. يجب تنفيذ هذه الأعمال فقط في منطقة الأعمال الساخنة المخصصة، باستخدام معدات مراقبة الحريق والإطفاء المناسبة وفقاً لنظام تصاريح الأعمال الساخنة في الموقع. إذا لم تكن متأكداً مما إذا كانت مهمتك تُعد من الأعمال الساخنة، أو أين تقع المنطقة المخصصة، اسأل مشرفك قبل البدء.'),

('task_ppe', 'en', 20, 'Task-Specific PPE Requirements', 'Beyond the three PPE items required at all times — hard hat, hi-vis vest, and safety shoes — many tasks carry their own specific protective equipment requirements. Grinding, sanding, and cutting work requires a face shield, cut-resistant gloves, and hearing protection in addition to the basics. Hot works and welding require a welding mask, flame-resistant clothing, and heat-resistant gloves. Work at height also requires a full-body harness and fall-arrest lanyard. This is not an exhaustive list — always confirm the exact PPE required for your specific task with your supervisor before you begin, and never substitute or skip task-specific PPE because the mandatory basics are already being worn.'),
('task_ppe', 'ar', 20, 'معدات الحماية الخاصة بالمهمة', 'بالإضافة إلى معدات الحماية الثلاث المطلوبة طوال الوقت — الخوذة والسترة العاكسة وحذاء السلامة — تتطلب العديد من المهام معدات حماية خاصة بها. يتطلب الجلخ والصنفرة والقطع واقي وجه وقفازات مقاومة للقطع وحماية للسمع بالإضافة إلى الأساسيات. تتطلب الأعمال الساخنة واللحام قناع لحام وملابس مقاومة للهب وقفازات مقاومة للحرارة. يتطلب العمل على ارتفاع أيضاً حزام أمان كامل وحبل منع سقوط. هذه ليست قائمة شاملة — تأكد دائماً من معدات الحماية الدقيقة المطلوبة لمهمتك مع مشرفك قبل البدء، ولا تستبدل أو تتجاوز معدات الحماية الخاصة بالمهمة لمجرد ارتداء الأساسيات الإلزامية.')
on conflict do nothing;

-- ---------- 3. Quiz questions for the two new topics ----------

insert into topic_questions
  (topic_key, language, question_text, correct_answer_text, incorrect_answer_text, correct_image_url, incorrect_image_url)
values
('hot_works', 'en', 'Where are cutting, grinding, or other hot works permitted on site?', 'Only in the designated hot works area, with the required fire controls in place', 'Anywhere on site, as long as no one complains', 'assets/quiz/hotworks_correct.jpg', 'assets/quiz/hotworks_incorrect.jpg'),
('hot_works', 'ar', 'أين يُسمح بأعمال القطع أو الجلخ أو غيرها من الأعمال الساخنة في الموقع؟', 'فقط في منطقة الأعمال الساخنة المخصصة، مع توفر ضوابط الحريق المطلوبة', 'في أي مكان في الموقع، طالما لا أحد يشتكي', 'assets/quiz/hotworks_correct.jpg', 'assets/quiz/hotworks_incorrect.jpg'),

('task_ppe', 'en', 'If your task requires PPE beyond the standard items, what should you do?', 'Confirm the specific PPE required with your supervisor before starting the task', 'Assume your standard PPE is enough and start the task', 'assets/quiz/taskppe_correct.jpg', 'assets/quiz/taskppe_incorrect.jpg'),
('task_ppe', 'ar', 'إذا كانت مهمتك تتطلب معدات حماية إضافية غير الأساسية، فماذا يجب أن تفعل؟', 'تأكد من معدات الحماية الخاصة المطلوبة مع المشرف قبل بدء المهمة', 'افترض أن معدات الحماية الأساسية كافية وابدأ المهمة', 'assets/quiz/taskppe_correct.jpg', 'assets/quiz/taskppe_incorrect.jpg')
on conflict do nothing;
