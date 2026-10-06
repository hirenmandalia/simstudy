# Research-guidelines knowledge base

The master agent loads every `*.md` file in this folder (and `examples/`) into its
system prompt. It uses the guidance to pick a method, spot missing inputs, write
neutral tasks and questions, define persona qualities, check study quality, and
structure the report.

## Status: cited draft (sources verified 4 Oct 2026) — PM review still required

Each guideline file (01–07) cites its sources inline as [n], with a numbered **Sources** list at the end. Every source was opened and checked against the claim it supports, unless a note in the file says otherwise. The text paraphrases the sources in our own words and does not reproduce them. Where something is our own product guidance rather than a sourced claim, the file says so.

Still to do before treating this as fully reviewed:
- Confirm the five Krueger question types against Krueger & Casey (5th ed., ch. 3). Krueger's demonstration video confirms the opening and ending questions, but the full five-type naming is still from a secondary source (03).
- Open the Indi Young (05) and Krug test-script (04) sources directly; they were checked via a mirror and a search snippet.
- `examples/krueger-moderating-focus-groups-lessons.md` contains notes from a real, published demonstration by Richard Krueger (cited). `examples/umn-focus-group-analysis-lessons.md` contains notes from a published University of Minnesota teaching session on focus-group analysis (cited). `examples/zoom-focus-group-student-lessons.md` contains de-identified notes from a published student-run online focus group (cited): useful for realistic participant behaviour and moderation mistakes to avoid, not as a model of good practice. The other files in `examples/` are **constructed** teaching transcripts, not real sessions. Replace them with reviewed real transcripts if you have any you're allowed to use.
- Re-check fast-moving sources in 07 (preprints, 2026 surveys) before the demo.

## Rules for this folder

- Only reviewed material goes here. Project outputs (transcripts, reports) are
  never written back automatically.
- Example transcripts in `examples/` are quality references for *how* to moderate
  and synthesise. They are never evidence about any feature being studied.
- Keep citations as [n] plus a Sources list so the agent can cite the knowledge base in study-design rationales.
- Keep the total size modest (roughly under 40k tokens). Everything here is sent
  with every master-agent request (prompt-cached).
