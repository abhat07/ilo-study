# ILO Study

A personal study app for one student (Biological Sciences, Imperial). It builds retrieval practice from **your own**
lecture slides, transcripts and Intended Learning Outcomes (ILOs), and decides what to practise and when. The only
choice you make is which module to study.

Runs in the browser on a phone or laptop. It is an installable PWA (progressive web app), and all learning data stays on the device.

---

## Build status

| Stage | Scope | Status |
|---|---|---|
| 1 | Module selection, upload, ILO parsing + confirmation, retrieval session, API key, spending cap, data notice | **Done** |
| 2 | Spaced repetition (FSRS), mastery model, confidence ratings | **Done** |
| 3 | Genetics module; re-ingestion and sync for new uploads | **Done** (Genetics works the same way as AMB; re-upload diffing is in) |
| 4 | More interactive formats | **Started**: drag-to-order and self-explanation prompts. Diagram labelling, Punnett/Hardy-Weinberg/PCR simulations, sketch-and-compare and the two-stage "explain it simply, then precisely" format are not built yet |
| 5 | Past papers | Not started (by design: do earlier phases first) |

**Not yet verified against the real API.** The full flow was tested end to end in the browser with a built-in fake
model (see [Testing](#testing)). The real Claude calls are written to the SDK's documented API, but they have not
run against a real key yet. The first real upload is the first live test. If a call fails, the app shows the
error and keeps working with what it already has.

---

## Run it

Needs [Node.js](https://nodejs.org) 20 or later.

```powershell
cd studyapp
npm install
npm run dev
```

Open http://localhost:5173.

Production build: `npm run build` creates static files in `dist/`. `npm run preview` serves that build locally.

### Live app (any device)

**https://abhat07.github.io/ilo-study/**

Hosted on GitHub Pages. Every push to `main` runs the tests, builds, and redeploys
(`.github/workflows/deploy.yml`). On a phone, open the link and choose **Add to Home Screen** (iPhone: Share →
Add to Home Screen; Android Chrome: ⋮ → Install app). After the first visit it opens offline.

Only the app's code is hosted. Each device and browser keeps its **own** data: your key, ILOs, questions and
progress. To move them, use Settings → **Export backup** on one device and **Restore** on the other. The key
is never in the backup, so enter it again on each device.

To try it on a phone over home Wi-Fi without hosting, run `npm run dev -- --host` and open the printed
network address. Everything works except offline mode.

---

## Sync across devices

Settings → **🔄 Sync across devices** keeps uploads, ILOs, questions, progress, XP and spend the same on every
device. The data goes through a **private GitHub repository** (e.g. `abhat07/ilo-study-data`):

* `sync/data.json.gz`: everything except original PDFs, as one gzip-compressed snapshot.
* `blobs/<sha256>.pdf`: original PDFs. Each is uploaded once and downloaded on another device only when you
  press "Show original slide".
* `img/<sha256>.jpg`: slide pictures from PowerPoints, the same way. Up to 30 go up per sync (GitHub limits how
  fast files can be created), so a big batch of decks takes a few minutes to reach your other devices.

**Setup, once per device:** create a fine-grained token with *Only select repositories → ilo-study-data* and
*Contents: Read and write*, then paste the repository name and the token into the Sync card. The token is
stored only in that browser, like the API key, and is never put in backups or the synced copy. The app refuses
to sync to a public repository.

**When it syncs:** when the app opens, when it returns to the foreground, 20 s after changes (an upload, an
answer, confirming ILOs), right after a session ends, every 5 minutes, and from **Sync now**.

**How merging works** (`src/sync/merge.ts`): pull, then merge with this device, then apply locally, then push
if anything changed. If another device pushed in the meantime, it merges again.

* Answers, sessions, spend, upload history and disputes are only ever added, so they are combined (union).
* If two devices answered the same question offline, its spaced-repetition schedule is rebuilt from the combined
  answers. Replay has no random fuzz, so every device computes the same schedule.
* A module's ILO list is taken whole from the device that confirmed it most recently, so deletions propagate.
  Passages: the newest edit wins. Questions keep their strictest status (retired > flagged > active).
* Duplicate questions generated for the same passage on two devices: the unanswered copies are retired.
* Applying a merge only ever adds or updates records. It never wipes, so work done during a sync is kept and
  goes up next time.

The repository's commit history doubles as a versioned backup. Six two-device scenarios are covered by
`tests/sync.test.ts`.

## API key and spending cap

1. Create an API key in the Anthropic Console (console.anthropic.com).
2. In the app, open **Settings (⚙)**. Paste the key and set a **monthly spending limit in pounds**.
   You can also do this on the first upload screen.
3. Accept the one-time **data notice** before any material is sent.

* The key is kept in this browser's `localStorage`, under `ilo.apiKey`. It is not in the source code or the
  repository, and backups leave it out. It is sent only to Anthropic, in the request header.
  **Settings → Remove key** deletes it.
* Spend is estimated for every call from the token counts in the response, at list prices converted at a fixed
  0.80 GBP/USD. The rate is rounded up on purpose so the cap triggers early. Settings shows this month's total and
  each recent call. Your Anthropic Console has the exact bill.
* Before each call the app checks: spent so far + calls in flight + this call's estimate ≤ cap. When the cap is
  reached, the app stops calling the API and says so on the home screen. Questions already on the device still
  work, and written answers switch to self-marking against the rubric.
* Generated questions are cached by **passage content hash + ILO + difficulty level** (`genlog` store), so the
  same passage is never paid for twice, even when a call produced nothing usable.

### Which model does what (edit `src/ai/pricing.ts` to change)

| Work | Model | Rough cost |
|---|---|---|
| Finding ILOs (fallback only), matching passages to ILOs, writing questions | `claude-haiku-5-5` | ~£0.001 per generation call (2–4 questions) |
| Marking written answers, "Explain this more" | `claude-opus-5-5` (with server-side refusal fallback on) | ~£0.02 per marked answer, ~£0.01 per explanation |

Written answers are the main cost. A session with 5 of them costs about 10p, and £5 a month is a comfortable cap.

---

## How to use it

1. **Home → Upload material** on a module. Choose **Upload a whole folder** (or drag the folder onto the card on a
   laptop) to add all of a module's slides (PDF/PPTX), transcripts (VTT/SRT/TXT), DOCX notes and ILO list at once.
   Files the app cannot read (for example .apkg or .xlsx) are skipped and listed. ILO documents are read first.
2. **Check ILOs.** The app copies ILOs out of your files: "Learning outcomes" slides, "By the end of this lecture
   you should be able to…" lists, or an ILO document. Edit, reorder, delete or paste ILOs, then confirm. Nothing is
   generated before you confirm.
3. The app matches every passage to ILOs and flags ILOs with **thin coverage** (fewer than 2 passages), then
   starts writing questions in the background.
4. **Start.** One tap; with questions ready, the first one appears in under a second.
5. **What I know.** Shows each ILO's mastery estimate in plain language, the evidence behind it, your
   calibration, uploads, held-back questions and disputes.

**Removing a file:** What I know → Material → **Remove**. Its passages stop being used and questions built on them are retired, but your past answers are kept. With sync on, the removal reaches your other devices and the PDF is deleted from the sync repository; the repository's commit history still has it until you rewrite that history. You can upload the file again later and get fresh questions.

Re-uploading a file with the same name compares it with the previous version. New passages are added and changed
or removed passages are found. Questions built on them are **held back** (status `flagged`) rather than deleted.
Your answers are never deleted.

---

## Demo mode

**Settings → 🧪 Demo mode** (or "Try the demo" at the bottom of the home screen) lets you try every feature
without real material or an API key:

* **Sample module** with three short lectures written for the demo: *PCR* (a PDF plus a lecture transcript),
  *Restriction cloning* and *Agarose gel electrophoresis* (PowerPoints with drawn slide pictures: an EcoRI cut
  site, a plasmid map and two gels). They're made on the device and go through the normal upload pipeline:
  reading, ILO confirmation, slide matching and lecture grouping. OCR is skipped in the demo.
* **Fake AI, free.** Lessons, questions, marking, "Explain this more" and the study helper come from a
  deterministic stand-in (`src/ai/mock.ts`). Lesson points are the slides' own sentences and the diagrams are
  hand-written for the seven demo ILOs. Every question type appears: fill-the-gap, multiple choice, short answer
  (marked by key words from the model answer), put-in-order, and link questions within and across lectures. The
  pretend spend still counts towards the cap shown, so the cap can be seen working.
* **Separate sandbox.** Demo data lives in its own database (`ilo-study-demo`). Your real modules, answers,
  XP and streak are untouched, and sync is off. A striped banner stays at the top. **Reset** clears only the
  sandbox and rebuilds it; **Exit demo** returns to your real data.

## Lectures and lessons

Each module is split into **lectures** (`src/learn/lectures.ts`). The split is automatic and free:

* **Files** are grouped by the lecture number in their name: `Lecture_07_Sequencing.pdf` goes to L7, and
  `Transcript_Lectures_07-08…` goes to both L7 and L8. A module-wide document such as an ILO list for lectures
  1–9 belongs to no single lecture.
* **ILOs** go to the lecture whose slides were matched to them most often. An explicit "Lecture N" label wins.
* You can fix anything under **Lectures → Edit lectures**: rename, add, or move files and ILOs. Your changes
  are kept when the grouping is rebuilt.

Each lecture is a **lesson path** (`src/learn/sections.ts`, `src/ui/Learn.tsx`), one section per ILO:

1. **Explain.** 4–10 short points written only from that lecture's passages for that ILO; admin and anecdotes
   are left out. Each point carries a verbatim quote that is checked on the device; points that fail the check
   are dropped. Points include an **animated visual** (process flow, cycle, comparison table or labelled parts)
   and **the original slides** (PDF pages rendered; PowerPoint slides show their own pictures; transcript
   passages shown as text). Slides with pictures are shown first. Tap one to enlarge it.
2. **Test every point.** The model writes 1–2 questions per point. Any point it misses gets a fill-the-gap made
   on the device from its quote, so nothing goes untested. **Link questions** follow: short answers that connect
   this ILO to earlier points in the lecture and the previous lecture, the building blocks of essay answers.
3. **Wrong answers repeat until right**, after the rest of the section. Every 4th question is a **spaced
   review** from an earlier section or the previous lecture.
4. A section is complete only when its explanation has been read **and** the latest answer to every question
   is right. The lecture's **progress ring** is the average over its ILOs, so it stalls rather than skipping
   gaps.
5. At **100%** the lecture switches to **recap**: an FSRS-scheduled session using only that lecture's
   questions (`#/m/<module>/l/<lecture>/recap`). The home card shows recap counts once a lecture is done.

The home card's main button continues the next unfinished lecture. "🔀 Mixed review" still runs the original
cross-module session; lesson questions you haven't reached yet are kept out of it.

Cost: one cheap-model call per ILO section, about 0.3p each, so roughly 15p to write lessons for 50 ILOs.
Sections are written on first open (the first is awaited, the rest continue in the background) and then synced
like everything else.

## The learning engine

| Principle | Where it lives |
|---|---|
| Retrieval practice / pretesting: answer before any explanation; "I don't know — show me" still counts as an attempt | `ui/Session.tsx` |
| Spaced repetition: FSRS via `ts-fsrs`, one card per question; grade comes from correctness **and** confidence (a correct guess is scheduled sooner) | `engine/scheduler.ts` |
| Spacing per ILO: new questions target the ILOs with the lowest mastery; mastery decays with time since last success | `engine/generate.ts`, `engine/mastery.ts` |
| Interleaving: the next question avoids the last two ILOs and the last lecture file; wrong answers return once after 4 other questions | `engine/session.ts` (`selectNext`) |
| Elaboration / self-explanation: "Why does this happen?" prompt after level-2+ questions, compared with the lecture | Feedback in `ui/Session.tsx` |
| Confidence before feedback: 4 confidence buttons *are* the submit button | `ui/Session.tsx` |
| Feedback that explains why: per-option explanations for MCQs, rubric points for written answers, quoted source passage highlighted, button to open the full slide and render the original PDF page | `ui/Session.tsx`, `ui/SourceView.tsx` |
| Adaptive difficulty: level 1 recall → 2 explain → 3 apply to a new scenario (transfer), chosen from the ILO's mastery | `engine/generate.ts` (`levelFor`) |
| Dual coding (partial): drag-to-order for processes, source slide shown next to the answer. No learning-style matching | `ui/answers.tsx` |

**Study helper (💬 Ask).** A floating chat bubble on the question screen, running on the cheapest model (Haiku, about 0.03p per message). It sees only the current question, its ILO and the slide the question came from, and labels anything else as "beyond course materials". Before you answer, it gives hints but never the answer. Using it before answering marks that answer as *hinted*: a hinted answer counts half towards mastery, and a correct hinted answer is scheduled sooner (graded Hard), so retrieval practice stays honest. After you answer, it explains freely. Each question starts a fresh conversation.

Sessions aim for **15 minutes or 24 questions**, then show a summary: answered, % correct, mastery changes per
ILO, over- and under-confidence, and the next review due.

### Colour choices and the evidence

The colour scheme changes with the learning stage (`body[data-stage]`) and the time of day (`html[data-time]`).
The research on colour and learning is uneven, so each choice notes how strong its evidence is.

| Stage | Colour | Why | Evidence |
|---|---|---|---|
| Home / starting | A calm palette of your choice (Settings → Look: Ink & brass by default, Terracotta, Sage, Tide, Ember) | Pleasant "emotional design" raises intrinsic motivation and retention | Moderate: meta-analyses Brom et al. 2018; Wong & Adesope 2021 (retention g ≈ 0.35 for emotional design overall) |
| Answering and reading (question, options, slide passage, explanations) | **Paper card: dark text on warm off-white** during the day | Dark-on-light ("positive polarity") gives better reading, proofreading and comprehension than light-on-dark | **Strong**, replicated: Buchner & Baumgartner 2007; Piepenbrock et al. 2013, 2014; Dobres et al. 2016 |
| While answering | Brand gradient switched off, calm top bar | Less competing salience while retrieving (signalling / cut extraneous load) | Theory-led (Mayer's signalling and coherence principles) |
| Correct | Green | Conventional meaning, fastest to recognise | Convention |
| Wrong | **Violet**, not red | Green vs violet stays distinguishable with red–green colour blindness (~8% of men); avoids an alarm colour | Colour-blindness: well established. Red-impairs-performance (Elliot et al. 2007) is **weak**: later meta-analysis and replications found limited evidence (Gnambs 2020; Steele et al. 2018) |
| Partly right | Amber | Between the two | Convention |
| "Think it through" | Teal panel | Marks a different mental task (elaborating), signalling | Signalling theory. "Blue boosts creativity" (Mehta & Zhu 2009) **failed direct replication** (Steele 2014), so it is not relied on |
| Session summary | Gold glow | Reward moment | Design choice |
| **21:00–06:00** | Paper turns dark-warm, less blue, dimmer | Evening short-wavelength (blue) light suppresses melatonin and delays sleep; sleep is when memories consolidate | **Strong**: Chellappa et al. 2013; Schöllhorn et al. 2023 (melanopic display light) |

All text and background pairs meet WCAG AA contrast (4.5:1 for body text). Buttons use near-black text on orange
(about 6:1) because white on orange fails.

The biology drawings on the home page (ATP, the electron transport chain and ATP synthase, the TCA cycle, B-DNA,
CRISPR–Cas9, Michaelis–Menten with a Lineweaver–Burk inset, translation, Gs/cAMP/PKA signalling, the nucleosome,
IgG1, pUC19, a dihybrid cross, an agarose gel and a PCR profile) are hand-written SVG (`src/ui/artHome.tsx`, `artLab.tsx`, `artGenetics.tsx`; placed by `Doodles.tsx`). Each screen has its own set: home (14), question screen (replication fork, Sanger, qPCR, western blot, *lac* operon, splicing; rotating per question), What I know (pedigree, Hardy–Weinberg, crossing over, linkage map, secondary structure, Ramachandran), and upload/settings mixes. On the question screen they are static and dimmed while you answer and brighten slightly on feedback, to limit the "seductive details" distraction; wide screens also get a session side panel (time, answered, % correct, XP, the ILO being tested and a tip).
They have no image licences, stay sharp at any size, recolour with the theme and work offline. They sit only in
the page margins and never behind the question card.

### Game layer (`engine/game.ts`)

XP, levels (Nucleotide → Codon → Gene → … → Biosphere), a 20-question daily goal, 3 daily quests (+30 XP each),
18 badges, and day streaks. Everything is **derived from your stored answers**, so backups carry it and nothing
can drift. The rules reward good learning:

* New questions earn more than repeats (10 vs 6, plus up to 10 for correctness). Due reviews still count.
* **Honest confidence** earns up to 20 XP via the Brier score, a *proper scoring rule*: for any belief you hold,
  reporting it truthfully maximises your expected XP. A unit test checks this for all four confidence levels.
* "I don't know" earns 3 XP, because attempting before seeing the answer helps.
* Applying an idea to a new case (+10), written answers (+5) and "Think it through" prompts (+5) earn extra.

### Mastery model (`engine/mastery.ts`)

Per ILO:

* **Accuracy**: a Beta posterior with a sceptical prior (mean 1/3). First attempts at **unseen** questions weigh
  1.0, unseen **transfer** questions 1.5, and **repeats of seen questions only 0.2**. Self-marked answers count at
  70% weight. **Disputed marks are excluded.**
* × **retention**: forgetting curve `(1 + t/9S)^-1`, where t = days since last success and S = mean FSRS
  stability of the ILO's questions.
* × **calibration**: confidently wrong answers (Fairly sure or Certain, but wrong) reduce the estimate.
* Capped at 0.79 ("Getting there") until a **transfer** question has been answered correctly.

Labels: Not yet < 0.3 ≤ Shaky < 0.6 ≤ Getting there < 0.8 ≤ Secure. Each ILO lists the evidence in sentences.

### Accuracy safeguards

* Questions are generated from **one passage at a time** (one slide, page or ~2 minutes of transcript), and the
  ILO is included in the prompt.
* Every question must include a **verbatim quote** from its passage. `quoteInPassage` checks it on the device,
  and questions that fail are **rejected** and logged in `genlog`. Cloze answers must appear in the passage, and
  MCQs need 4 distinct options.
* If the model decides the passage does not teach the ILO, it returns nothing.
* Anything outside the materials goes in a separate field shown as **"Beyond course materials"**. It is never
  used in answers, rubrics or marking.
* Written answers are marked by Opus against a rubric built from the ILO and passage. The app shows the rubric,
  per-point reasoning and the marker's confidence. **Dispute this mark** logs the dispute (`disputes` store) and
  removes that answer from the mastery estimate.

---

## Architecture

```
src/
  main.tsx              hash router, PWA registration, warms the question pool on launch
  db.ts                 IndexedDB schema (idb), helpers, default modules
  settings.ts           API key / cap / notice in localStorage (key never exported)
  backup.ts             export/import .zip (data.json + original PDFs)
  types.ts              data model
  ai/
    client.ts           only path to the API: cap check, call, spend log, error mapping
    pricing.ts          model routing + price table + GBP conversion
    prompts.ts          system prompts and JSON schemas (structured outputs)
    mock.ts             fake model for demo mode (and `npm run dev` with ilo.mock=1)
  mode.ts               demo mode flag (separate database, fake AI, no sync)
  demo/                 demo content and on-device sample files (PDF, VTT, PPTX with pictures)
  ingest/
    extract.ts          PDF (pdf.js), PPTX/DOCX (JSZip + XML), VTT/SRT/TXT → passages
    slideImages.ts      PowerPoint slide pictures: logo/template filter, shrink to JPEG, store per slide
    ocr.ts              on-device OCR (tesseract.js) for diagram-heavy pages and slide images
    text.ts             transcript parsing, chunking, normalisation, quote check
    ilo.ts              local ILO detection
    lexical.ts          offline TF-IDF passage↔ILO matcher (fallback)
    pipeline.ts         ingest + re-ingestion diff, ILO confirm, mapping, coverage
  engine/
    generate.ts         question generation, validation, cache, background pool top-up
    scheduler.ts        FSRS wrapper
    mastery.ts          mastery + calibration
    session.ts          next-question selection, local marking, attempts, disputes, summary
    marking.ts          AI marking, self-marking, "explain more" (cached)
  ui/                   Preact screens: Home, Upload, IloConfirm, Session, ModulePage, Settings
tests/core.test.ts      unit tests (vitest)
scripts/                icon generator, sample-file generator for testing
```

Stack: Vite + TypeScript + Preact, `idb`, `pdfjs-dist`, `jszip`, `tesseract.js`, `ts-fsrs`,
`@anthropic-ai/sdk` (lazy-loaded), `vite-plugin-pwa`.

### What leaves the device

1. **API calls to Anthropic**, and only after you accept the notice. Each call carries the text of one passage
   (question writing), a batch of 25 passages cut to 900 characters each (ILO matching), the ILO-like passages
   (AI ILO search, only if the local parser finds none), or a question + rubric + passage + your answer (marking).
2. **Sync (if you turn it on).** The synced copy above goes to your private GitHub repository.
3. **OCR engine download.** The first OCR run downloads the Tesseract engine and English data from jsDelivr.
   This is a download only: no content is sent.

Nothing else. There are no accounts and no analytics.

---

## Data format

IndexedDB database `ilo-study`, version 1. The stores (see `src/types.ts`):

| Store | Key | Holds |
|---|---|---|
| `modules` | `id` (e.g. `LIFE50016`) | short name (`AMB`), name, `iloStatus` (none/pending/confirmed) |
| `files` | `id` | name, kind, sha-256, version, `status` (active/superseded), original PDF blob |
| `chunks` | `"<file name>\|<locator>"` | passage text, locator (`slide`/`page`/`time` start–end s/`section`), text hash, OCR flag, `iloIds`, status (active/changed/removed) |
| `ilos` | `"<SHORT>-NN"` (e.g. `AMB-07`) | text, lecture label, order, source chunk |
| `items` | `id` | question (type, level, prompt, options, answer, rubric, explanation, elaboration, beyond-materials), **source ref** (chunk id, file, locator, verbatim quote, passage hash), FSRS `card`, status |
| `attempts` | `id` | item, ILOs, session, time, **confidence 1–4**, response, score 0–1, first-exposure flag, transfer flag, mark detail (auto/ai/self, rubric points, reasoning, marker confidence), disputed flag |
| `disputes` | `id` | attempt, reason, original score |
| `sessions` | `id` | start/end, attempt ids, mastery before/after |
| `spend` | `id` | month, model, purpose, tokens, £ |
| `genlog` | cache key | accepted/rejected counts and rejection reasons |
| `events` | `id` | upload history and diff summaries |
| `kv` | string | pending ILO candidates, cached explanations |

**Backup file** (Settings → Export): a `.zip` containing `data.json`
(`{ app: "ilo-study", version: 1, exportedAt, settings: {cap, notice}, stores: {...} }`), `files/<id>.pdf` and
`images/<sha256>.jpg` (slide pictures).
Restoring replaces everything on the device.

What a backup contains: every module, the extracted text of **every** uploaded file (slides, pages, transcript
passages, OCR text), your confirmed ILOs, all generated questions, your full answer history, spend log, XP and
badges. Original **PDF** files and PowerPoint **slide pictures** are included so slides still show. Original PPTX, DOCX and
transcript files are not stored, only their text, so after a restore you can study everything but cannot
re-download those originals from the app. Backups are manual (export, then restore on the other device), not
automatic syncing. Dates inside FSRS cards become ISO strings in JSON and are converted
back on use.

---

## Adding a module

On the home screen, choose **+ Add a module** and enter the code (`LIFE50025`), a short name used in ILO ids
(`BIP`) and the full name. Then upload its material as for AMB. To make it a built-in default, add it to
`DEFAULT_MODULES` in `src/db.ts`.

---

## Testing

```powershell
npm test
```

28 unit tests cover VTT/SRT/timestamped-text parsing, the quote traceability check, ILO detection, the lexical
matcher, mastery weighting (unseen vs repeat, transfer cap, decay, overconfidence, disputes), the FSRS grade
mapping, item validation, local marking, interleaving and retry selection, and pricing.

Type check: `npx tsc --noEmit`.

**Fake model for manual testing (dev only):** run `npm run dev`, open Settings → Developer → "Use the fake model".
It returns crude but correctly-shaped answers with no API calls, so you can exercise upload → ILOs → session
without a key. Production builds cannot use it. `node scripts/make-fixtures.mjs` writes small sample lecture
files (made-up content, not course material) into `dev-fixtures/`.

Manually checked in the browser at phone (375 px) and laptop widths: upload of PDF + PPTX (with speaker notes) +
VTT, ILO detection and confirmation, mapping and coverage, every question type, AI-marked and self-marked written
answers, rendering the original PDF page, drag-to-order, session summary, re-upload of a changed PDF (diff +
holding back questions, history kept), the spending cap (generation stops, self-marking takes over, existing
questions still served), backup export → restore round-trip, and on-device OCR.

---

## Assumptions

1. **Model provider: Anthropic Claude**, with Haiku 5.5 for bulk work and Opus 5.5 for marking and explanations
   (chosen at setup).
2. **Spend is an estimate**: list prices × token counts, fixed 0.80 GBP/USD. The cap counts calls made from this
   browser only. Spend on another device, or with the same key elsewhere, is not seen.
3. **ILOs come from your files**, never from the model, unless the local parser finds none and you press "Find
   ILOs with AI". The model is told to copy ILOs verbatim, and you confirm them either way.
4. **Passage = one slide / one PDF page / ~150 words or 2 minutes of transcript / ~220 words of a DOCX.**
   Passages under 60 characters are not matched to ILOs and passages under 80 are not used for questions.
5. **OCR** runs on PDF pages with under 200 characters of text and on PNG/JPEG images over 15 KB inside PPTX
   slides. EMF/WMF vector images in PPTX cannot be OCR'd.

   **Slide pictures (PowerPoint).** At upload, each slide's PNG/JPEG/GIF/BMP pictures are saved, shrunk to at
   most 1100 px wide as JPEG (typically 15–60 KB each). Skipped: pictures under 6 KB or 140×90 px (bullets,
   icons), and any picture repeated on at least 3 slides and a quarter of the deck (logos, template
   backgrounds). Text boxes, shapes, SmartArt and EMF/WMF drawings are not pictures, so they appear as the
   slide's text, not as an image; PDFs render the whole page. Re-uploading a PowerPoint you added before this
   feature only adds its pictures (no new passages or questions).
6. **Session length** is fixed at 15 minutes / 24 questions and is not a setting (the brief allows no manual
   settings). It ends early if only not-yet-due repeats are left.
7. **Mastery thresholds and weights** (above) are reasonable defaults, not fitted to data. FSRS uses default
   parameters with 90% target retention.
8. **Disputes** are logged and remove that answer from the mastery estimate. There is no automatic re-mark.
9. **Re-ingestion** matches files by **file name**. A renamed file counts as a new file.
10. The API key is sent from the browser directly to Anthropic (`dangerouslyAllowBrowser` in the SDK). That is
    the only way a server-less, local-only app can call the API. Anyone with access to your unlocked browser could
    read the key, so remove it on shared machines.
