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

1. **Home → Upload material** on a module. Pick slides (PDF/PPTX), transcripts (VTT/SRT/TXT), DOCX notes and the
   ILO list. You can select several at once.
2. **Check ILOs.** The app copies ILOs out of your files: "Learning outcomes" slides, "By the end of this lecture
   you should be able to…" lists, or an ILO document. Edit, reorder, delete or paste ILOs, then confirm. Nothing is
   generated before you confirm.
3. The app matches every passage to ILOs and flags ILOs with **thin coverage** (fewer than 2 passages), then
   starts writing questions in the background.
4. **Start.** One tap; with questions ready, the first one appears in under a second.
5. **What I know.** Shows each ILO's mastery estimate in plain language, the evidence behind it, your
   calibration, uploads, held-back questions and disputes.

Re-uploading a file with the same name compares it with the previous version. New passages are added and changed
or removed passages are found. Questions built on them are **held back** (status `flagged`) rather than deleted.
Your answers are never deleted.

---

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

Sessions aim for **15 minutes or 24 questions**, then show a summary: answered, % correct, mastery changes per
ILO, over- and under-confidence, and the next review due.

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
    mock.ts             DEV-ONLY fake model
  ingest/
    extract.ts          PDF (pdf.js), PPTX/DOCX (JSZip + XML), VTT/SRT/TXT → passages
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
2. **OCR engine download.** The first OCR run downloads the Tesseract engine and English data from jsDelivr.
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
(`{ app: "ilo-study", version: 1, exportedAt, settings: {cap, notice}, stores: {...} }`) and `files/<id>.pdf`.
Restoring replaces everything on the device. Dates inside FSRS cards become ISO strings in JSON and are converted
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
   slides. EMF/WMF vector images in PPTX cannot be OCR'd. Rendering the original slide works for PDFs only. For
   PPTX, export to PDF if you want slide images.
6. **Session length** is fixed at 15 minutes / 24 questions and is not a setting (the brief allows no manual
   settings). It ends early if only not-yet-due repeats are left.
7. **Mastery thresholds and weights** (above) are reasonable defaults, not fitted to data. FSRS uses default
   parameters with 90% target retention.
8. **Disputes** are logged and remove that answer from the mastery estimate. There is no automatic re-mark.
9. **Re-ingestion** matches files by **file name**. A renamed file counts as a new file.
10. The API key is sent from the browser directly to Anthropic (`dangerouslyAllowBrowser` in the SDK). That is
    the only way a server-less, local-only app can call the API. Anyone with access to your unlocked browser could
    read the key, so remove it on shared machines.
