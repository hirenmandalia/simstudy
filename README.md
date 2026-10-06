# SimStudy: simulated user research for mobile product teams

A capstone prototype of an AI agent that runs a **simulated** usability test or focus group for a product manager (PM), then writes a decision-ready report.

The PM describes a feature (a new idea or a partly built feature) and the decision they face: build it, or launch it. They approve a study plan and a set of fictional personas. AI "participants" then react to demo-safe screenshots of the app, and the agent turns their sessions into a report with findings, recommendations and quotes checked against the transcript.

**The PM approves every step and owns the build or launch decision.** Everything the agents produce is labelled **AI-generated simulated research**: early signal, not a substitute for real users.

> Status: working prototype built for a capstone project. It runs locally with file-based storage. It is not production-hardened.

---

## Contents
1. [How it works](#how-it-works)
2. [Rebuild it locally (step by step)](#rebuild-it-locally-step-by-step)
3. [Configuration reference](#configuration-reference)
4. [Try it in 5 minutes](#try-it-in-5-minutes)
5. [Architecture](#architecture)
6. [Guardrails](#guardrails)
7. [Testing and evals](#testing-and-evals)
8. [Research knowledge base](#research-knowledge-base)
9. [Repository map](#repository-map)
10. [Troubleshooting](#troubleshooting)
11. [Known limitations](#known-limitations)
12. [License](#license)

---

## How it works

| Step | Where in the app | Who decides |
|---|---|---|
| 1. **Interview:** the agent asks about the product, the build-or-launch decision, research questions and target users | Chat panel (on every project page) | PM answers; the agent records the answers |
| 2. **Upload screens:** demo-safe screenshots plus a short note on how screens connect | **Brief & screens** tab | PM confirms the screens are public and redacted; each upload is checked for personal data |
| 3. **Study design:** method, tasks or discussion guide, participant count (max 12) | **Study design** approval screen | PM edits, approves or rejects |
| 4. **Personas:** fictional participants matching the target users | **Personas** approval screen (only after the design is approved) | PM edits, approves or rejects |
| 5. **Run:** AI personas complete the usability tasks or hold a focus group | **Run** screen button, or asking the agent explicitly | Only the approved plan can run |
| 6. **Report:** findings, recommendations, quotes verified against the transcript, limitations | **Report** approval screen | PM edits, requests changes, approves or rejects. Download and share links unlock only after approval |

---

## Rebuild it locally (step by step)

### 1. Prerequisites
- **Node.js 20.9 or newer** (Node 22 LTS recommended): https://nodejs.org. Check with `node -v`.
- **An Anthropic API key**: create one in the Anthropic Console (https://platform.claude.com/). Running studies uses paid API credits (see [costs](#costs)).
- macOS, Linux or Windows. Google Chrome is only needed to re-render the demo screenshots.

### 2. Get the code and install dependencies
```bash
git clone https://github.com/<your-account>/<repo-name>.git
cd <repo-name>
npm install
```

### 3. Create your local environment file
```bash
cp .env.example .env.local
```
Then edit `.env.local`:
- `ANTHROPIC_API_KEY`: your key.
- `ANTHROPIC_WORKSPACE_ID`: **only if** your key is an organisation-level key that isn't scoped to a workspace (see [Troubleshooting](#troubleshooting)).
- `AUTH_SECRET`: any long random string. Generate one with:
  ```bash
  npx auth secret
  ```
  or `openssl rand -base64 32`.

`.env.local` is git-ignored. **Never commit it.**

### 4. Start the app
```bash
npm run dev
```
Open http://localhost:3000.
- Without Google OAuth configured, you'll see **Continue as Demo PM**. This login only works in local development.
- To use Google sign-in, see [Configuration reference](#configuration-reference).

### 5. (Optional) Seed a demo project, no AI calls
Sign in once, then:
```bash
npm run seed-demo
```
This creates "Demo: Pantry Pal collections (seeded)" with a brief, five fictional screens, and a study design and personas waiting for your approval.

---

## Configuration reference

All settings live in `.env.local` (template: `.env.example`).

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `ANTHROPIC_WORKSPACE_ID` | Only for org-level keys | Workspace to bill (`wrkspc_...`) when the key isn't workspace-scoped |
| `AUTH_SECRET` | Yes | Signs session cookies (Auth.js) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | For Google sign-in | OAuth client from Google Cloud Console (type "Web application"). Authorised redirect URI: `http://localhost:3000/api/auth/callback/google` |
| `ENABLE_DEV_LOGIN` | No | `true`/`false` to force the local Demo PM login on or off |
| `MASTER_MODEL`, `PERSONA_MODEL`, `UTILITY_MODEL` | No | Models per role. All default to `claude-opus-5-5`. Set `PERSONA_MODEL=claude-sonnet-5-5` to cut run cost |
| `MASTER_EFFORT`, `PERSONA_EFFORT`, `SYNTHESIS_EFFORT` | No | Reasoning effort per role (defaults: `medium`, `low`, `high`) |
| `RUN_CONCURRENCY` | No | Persona sessions run in parallel (default 3) |
| `DATA_DIR` | No | Where projects are stored (default `./data`) |
| `DISABLE_GUARD` | No | `true` skips the input content guard (testing only) |

---

## Try it in 5 minutes
1. `npm run dev`, sign in, then `npm run seed-demo`. Refresh the projects page.
2. Open **Demo: Pantry Pal collections (seeded)**.
3. On **Study design**, read the plan and click **Approve**. Do the same on **Personas**.
4. On **Run**, click **Run simulated study** and watch the transcript fill in.
5. When it finishes, the report appears on **Report**. Edit it, request changes, approve it, then download it or create a read-only share link.

To try the full interview, create a new study and answer the agent in the chat panel.

### Costs
Everything runs on Claude Opus 5.5 by default.
- A **chat turn** costs cents.
- A **full simulated study** (5 personas, 3 tasks, report) makes roughly 60–100 calls. The **Run** screen shows an estimated cost for each run.
- **Focus groups** make more calls than usability tests.
- Switching personas to Sonnet 5.5 (`PERSONA_MODEL=claude-sonnet-5-5`) lowers cost.

---

## Architecture

- **Stack:** Next.js 16 (App Router, TypeScript, Tailwind), Auth.js v5 (Google + local demo login), the Anthropic TypeScript SDK, Zod.
- **Storage:** plain JSON files on disk, one folder per project.

```
PM (browser)
   │  chat, approvals, uploads
   ▼
Next.js API routes ──► Guard classifier (blocks inappropriate input)
   │
   ▼
Master agent (Claude, tool loop)
   tools: update_study_brief · propose_study_design · propose_personas
          start_study_run · regenerate_report · record_guardrail_event
   │                         ▲
   │ code gates (lib/gates)  │ research knowledge base (knowledge/*.md)
   ▼
Run engine (src/agent/run.ts)
   ├─ Usability test: one session per persona
   │    tasks → structured think-aloud attempt → neutral moderator probe → debrief
   └─ Focus group: opening round → key questions + probes + cross-talk
        → "most important thing said" round → moderator summary confirmed by the group
   then: consistency check per persona (flags out-of-character or invented UI)
   ▼
Synthesis (src/agent/synthesis.ts)
   structured report → every quote verified against the transcript → task metrics computed in code
   ▼
PM reviews / edits / approves → download (Markdown) or read-only share link
```

**Context and memory**
- **Shared across projects:** the research knowledge base (`knowledge/`), loaded into the master agent's cached system prompt. Project outputs are never written back to it.
- **Per project:** brief, screens, versions, approvals, transcript, report, audit log and the agent's conversation, stored only in that project's folder (`data/users/<user>/projects/<project>/`). Deleting a project deletes the folder.
- **Persona sub-agents** see only their own persona card, the approved tasks or questions, and the screens. They never see the knowledge base, other personas' cards, or the PM conversation.

---

## Guardrails

1. **Input guard:** blocks inappropriate content before any agent sees it.
2. **Master-agent rules:** stay in scope, no real-user contact or incentives, no private data, no build/launch decisions, no external sharing, project isolation, a 12-participant cap, and the prototype is free. Refusals are logged and shown as labelled guardrail messages.
3. **Code gates:** these can't be bypassed by prompting.
   - A run needs an approved design and personas approved for that design version.
   - Persona count must equal participant count, which must be 12 or fewer.
   - Any edit creates a new version and withdraws the existing approval.
   - Changing screens or the flow after approval withdraws the design approval.
   - A run freezes a copy of the approved plan.
4. **Output checks:** a persona consistency check, verbatim quote verification, metrics computed in code, and "simulated" labels on every artifact and export.

---

## Testing and evals

```bash
npm run typecheck
npm run lint
npm run eval                  # guardrail scenarios: out-of-scope, inappropriate content, >12 participants, fees, approval integrity (5 variants)
npm run eval -- --happy       # + full end-to-end study and report (several minutes, uses the most credits)
npm run eval -- --case fee    # a single scenario
```

- Evals use a separate data folder (`eval-data/`).
- In the guardrail cases, runs are never executed, even if the agent tries (`SIMSTUDY_DRY_RUN`).
- Each eval writes `eval-results/eval-<timestamp>.md`. It records each PM input, the agent's reply, the tools it called, whether it proceeded or stopped, programmatic checks, and an LLM-judge verdict.

---

## Research knowledge base

`knowledge/` holds the research guidance the master agent uses to choose methods, write neutral tasks and questions, define personas, and structure reports.

- **Guideline files** (`01-` to `07-`) cite their sources inline (Nielsen Norman Group, MeasuringU, peer-reviewed papers, W3C, focus-group handbooks). Each source was checked against the claim it supports.
- **`examples/`** contains notes in our own words on published focus-group videos, with citations. It also has two clearly labelled teaching transcripts that are made up.
- See `knowledge/README.md` for review status and open items.

Market context is in `docs/competitive-brief.md`.

---

## Repository map

```
src/
  agent/        master agent, prompts, guard, run engine, synthesis, LLM wrapper
  lib/          schemas (zod), gates, review/versioning, file store, export
  app/          pages (projects, approval screens, run, report, share) + API routes
  components/   UI: chat panel, review bars, editors, transcript, report document
  auth.ts       Auth.js config (Google + local demo login)
knowledge/      cited research guidelines + examples
scripts/        eval.ts, seed-demo.ts, fixtures.ts
demo/           fictional "Pantry Pal" mock app + rendered screens S1–S5
docs/           competitive brief
.env.example    configuration template (no secrets)
```

---

## Troubleshooting

- **"This API key is not scoped to a workspace…"**
  - Your key is organisation-level. Set `ANTHROPIC_WORKSPACE_ID` in `.env.local` (Console → Settings → Workspaces), or create a key inside a workspace.
  - Restart `npm run dev` after editing `.env.local`.
- **"No Anthropic credentials found"**
  - `ANTHROPIC_API_KEY` is missing or empty in `.env.local`. Restart the server after adding it.
- **No sign-in button**
  - Set `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, or run in development, where the Demo PM login appears automatically.
- **A run shows "interrupted"**
  - The server restarted mid-run. Background work lives in the Node process; start the run again.
- **Re-render demo screens**
  - `npm run render-demo-screens` (needs Google Chrome; the script uses the macOS Chrome path).

---

## Known limitations

- Simulated participants are not real users. Treat results as directional. See `knowledge/07-simulated-research-limits.md` for the evidence.
- Static screenshots can't test real interactions, timing or error states.
- File-based storage and in-process background jobs suit a single-machine prototype. Swap `src/lib/store.ts` for a database to deploy.
- Personas are assumption-based ("proto-personas"), not grounded in real customer data yet.

---

## License

The code is released under the [MIT License](LICENSE): you're free to use, modify and share it, with attribution.

Cited third-party sources in `knowledge/` (articles, papers, videos) belong to their authors. The knowledge-base files summarise them in our own words and link to the originals.
