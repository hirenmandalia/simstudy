# Usability testing

## Session structure
A usability session moves through introductions, warm-up, set-up, tasks, follow-up questions and wrap-up, with one participant per session [1].
1. **Introduction:** thank the participant and explain that the design is being tested, not them. Ask them to think aloud. Make clear that honest criticism is useful.
2. **Warm-up:** 1–3 easy questions about the participant's context and current habits that relate to the research questions.
3. **Tasks:** usually 3–5 realistic tasks, ordered from simpler to more complex. Read each one as a scenario. Stay quiet while the participant works, then ask open, neutral follow-up questions [1].
4. **Debrief:** open questions about overall impressions, confusion, perceived value, and anything they expected but didn't find.
5. **Wrap-up:** thank them.

## Writing tasks
- Turn user goals into **realistic, actionable scenarios**. Give context and motivation, and ask the participant to *do* something, not describe how they would do it [2].
- **Avoid clues.** Don't use interface terms or describe the steps. Labels taken from the UI prime participants and hide discoverability problems [2][3].
- Start from the user's end goal, not a feature [3].
- Work from research goals to scenarios, and **define success and failure criteria** for each one [4]. One research goal can need several scenarios, and goals that share activities can be combined into one scenario [4].
- Map every task to at least one research question.

## Think-aloud and moderation
- **Think-aloud:** participants say what they are thinking as they use the design. The method is cheap, robust and persuasive, but it is unnatural, participants filter what they say, and a facilitator can bias it [5].
- **Neutrality:** don't hint, explain the design, or show approval. When a participant asks a question, answer with a question: echo their words back, return the question to them ("What do you think?"), or play dumb to draw out more ("Columbo"). Talking too much changes behaviour and can invalidate findings [6].
- Probe after the attempt rather than during it, unless the participant is completely stuck.

## Measures
- **Task outcome:** completed, completed with difficulty, failed, or gave up, judged against the predefined success criteria [4].
- **Single Ease Question (SEQ):** a 7-point rating right after each task: "Overall, how difficult or easy was the task to complete?", from 1 (very difficult) to 7 (very easy). Across hundreds of tasks the average is about 5.3–5.6. Treat averages from small samples as rough indicators only [7].
- **Observed problems:** what happened, on which screen, and for how many participants.

## Severity of usability problems
Severity combines **frequency**, **impact** and **persistence** (whether users can learn to work around it), with market impact as an extra consideration [8]. Nielsen uses a 0–4 scale from "not a problem" to "usability catastrophe", averaged across several evaluators [8]. This product maps severity to four labels:
- **Critical:** stops task completion or causes a serious error.
- **Major:** significant delay, confusion or workarounds.
- **Minor:** cosmetic or brief hesitation.
- **Positive:** worked well; worth keeping.

A problem seen once can still be critical if it blocks completion.

## Testing static screenshots
Static or low-fidelity material changes the test.
- With paper or static prototypes, someone has to swap screens by hand. That causes delays and errors, and participants study pages longer than they would in real use [9].
- Static screenshots are useful for testing comprehension, labelling, how easy an entry point is to find, and what users expect to happen next.
- They can't test real interactions, timing, gestures, animation, or error states that aren't shown. State this limitation in reports. This last point is our inference from [9], not stated directly in the source.

## Sources
1. "How to Conduct a Usability Test." Digital.gov (U.S. General Services Administration). https://digital.gov/resources/how-conduct-usability-test
2. McCloskey, M. "Turn User Goals into Task Scenarios for Usability Testing." Nielsen Norman Group, 12 Jan 2014. https://www.nngroup.com/articles/task-scenarios-usability-testing/
3. Schade, A. "Write Better Qualitative Usability Tasks: Top 10 Mistakes to Avoid." Nielsen Norman Group, 9 Apr 2017. https://www.nngroup.com/articles/better-usability-tasks/
4. Farrell, S. "From Research Goals to Usability-Testing Scenarios: A 7-Step Method." Nielsen Norman Group, 17 Sep 2017. https://www.nngroup.com/articles/ux-research-goals-to-scenarios/
5. Nielsen, J. "Thinking Aloud: The #1 Usability Tool." Nielsen Norman Group, Jan 2012. https://www.nngroup.com/articles/thinking-aloud-the-1-usability-tool/
6. Pernice, K. "Talking with Participants During a Usability Test." Nielsen Norman Group, 26 Jan 2014. https://www.nngroup.com/articles/talking-to-users/
7. Sauro, J. "10 Things to Know About the Single Ease Question (SEQ)." MeasuringU, 30 Oct 2012. https://measuringu.com/seq10/
8. Nielsen, J. "Severity Ratings for Usability Problems." Nielsen Norman Group, 1 Nov 1994. https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/
9. Pernice, K. "UX Prototypes: Low Fidelity vs. High Fidelity." Nielsen Norman Group, 18 Dec 2016. https://www.nngroup.com/articles/ux-prototype-hi-lo-fidelity/
