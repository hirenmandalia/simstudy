# Limits of simulated (AI-persona) research

Simulated participants are language models role-playing fictional personas. The evidence supports using them for fast, directional signal, for generating hypotheses, and for stress-testing a study plan. It does not support treating them as users or their output as measurement [1][2][3].

## What the evidence says works (with limits)
- **Aggregate, directional predictions.**
  - Simulated responses predicted the effects of 70 pre-registered experiments at r ≈ 0.85 in the preprint [4].
  - The published version reports accuracy similar to pooled human forecasters and notes that LLMs systematically *overestimate* effect sizes [5].
- **Grounding personas in real people's data.**
  - Agents built from two-hour interviews answered General Social Survey items 85% as accurately as participants matched their own answers two weeks later. They also showed less racial and ideological bias than agents prompted with demographics only [6].
  - NN/g's review finds interview-based "digital twins" outperform demographic-only personas. Accuracy drops on questions far from what the interviews covered, and twins should complement human research, not replace it [2].
  - SimStudy's personas are *not* grounded in real people. Treat them as weaker than the twins in these studies.
- **Expert-style review of screenshots.**
  - A multimodal LLM doing heuristic review found 73–77% of usability issues in two apps, compared with 57–63% for five experienced evaluators [7].
  - It struggled with UI conventions and with problems that span several screens.
  - This is *expert review*, not a simulation of user behaviour.

## Known failure modes
- **Sycophancy and the gap between saying and doing.**
  - In NN/g's comparison, synthetic users praised concepts and claimed to have completed every online course. Real learners admitted dropping out.
  - NN/g judged the synthetic answers too shallow to be useful [1].
- **Neat, over-successful task paths.**
  - In Userbrain's test on a pricing page, all 5 synthetic users completed a task that only 3 of 5 real users managed. The synthetic users skipped the friction points real users hit [8].
  - Loop11 found the opposite failure on live tasks. AI agents completed far fewer tasks than humans: 0–25% vs 62–95% on a prototype, and 5–21% vs 73–87% on a staging site. They navigated less efficiently [9].
  - Either way, simulated task success says little about real task success.
- **Generic feedback that misses real interaction problems.**
  - Given screenshots from three tested prototypes, GPT-4's feedback focused on visuals rather than interaction and missed problems real participants hit.
  - It also contradicted itself [10].
- **Too little variance and too much homogeneity.**
  - Persona-prompted responses varied much less than real survey data. 48% of regression coefficients differed significantly from the human data, and about a third of those had the wrong sign [11].
  - A review of 12 papers counted 9 encouraging and 14 discouraging findings, with reduced variance a recurring problem [3].
- **Poor individual-level fidelity.**
  - Across 19 pre-registered studies, the average individual-level correlation between twins and their humans was r = 0.20.
  - The study names five distortions: stereotyping, insufficient individuation, representation bias, ideological bias and hyper-rationality [12].
- **Misportraying identity groups.**
  - LLMs standing in for participants misportray demographic groups and flatten the diversity within them. This harms marginalised groups most [13].
- **Instability.** Results shift with small prompt changes and over time as models are updated [11].

## Practitioner sentiment
A May 2026 survey of 150 researchers found:
- 8% actively use synthetic users; 47% are sceptical and want more evidence.
- 88% worry about quality; 79% worry stakeholders will over-trust AI findings; 79% worry about amplifying bias.
- 62.7% have no internal guidance [14].

## How this product responds
- **Personas** are told to behave imperfectly, stay in character, and voice criticism rather than politeness (anti-sycophancy).
- **A consistency check** flags out-of-character lines, invented UI and contradictions. Synthesis gives flagged lines less weight.
- **Reports** use counts rather than percentages, state confidence and limitations, verify quotes against the transcript, and say what to validate with real users.
- **Labelling:** every output is labelled "AI-generated simulated research".

## When real-user validation is required
Simulations can support exploratory work, but they give no statistical guarantees for confirmatory claims. Valid inference needs real human data, either directly or by calibrating the simulation against a human sample [15]. Validate with real users:
- before high-stakes or hard-to-reverse decisions (large launches, pricing);
- when results will be presented as evidence of demand or behaviour;
- when accessibility, sensitive domains (health, finance, children) or under-represented groups are involved [13][15];
- when simulated results conflict with other evidence.

## Sources
1. Rosala, M., & Moran, K. "Synthetic Users: If, When, and How to Use AI-Generated 'Research'." Nielsen Norman Group, 21 Jun 2024. https://www.nngroup.com/articles/synthetic-users/
2. Budiu, R. "Evaluating AI-Simulated Behavior: Insights from Three Studies on Digital Twins and Synthetic Users." Nielsen Norman Group, 15 Aug 2025. https://www.nngroup.com/articles/ai-simulations-studies/
3. Lewis, J., & Sauro, J. "A Review of Experiments with Synthetic Users." MeasuringU, 14 Apr 2026. https://measuringu.com/review-of-experiments-with-synthetic-users/
4. Hewitt, L., Ashokkumar, A., Ghezae, I., & Willer, R. (2024). Predicting Results of Social Science Experiments Using Large Language Models (preprint). https://ai4pb.stanford.edu/projects/predicting-results-of-social-science-experiments-using-large-language-models
5. Ashokkumar, A., Hewitt, L., Ghezae, I., & Willer, R. (2026). Large language models can predict the results of social science experiments. *Nature*, 656, 115–122. https://www.gsb.stanford.edu/faculty-research/publications/large-language-models-can-predict-results-social-science-experiments
6. Park, J. S., Zou, C. Q., Shaw, A., Hill, B. M., Cai, C., Morris, M. R., Willer, R., Liang, P., & Bernstein, M. S. (2024). Generative Agent Simulations of 1,000 People. arXiv:2411.10109v1. https://arxiv.org/abs/2411.10109v1 (later versions are retitled, with updated figures).
7. Zhong, R., McDonald, D. W., & Hsieh, G. (2025). Synthetic Heuristic Evaluation: A Comparison between AI- and Human-Powered Usability Evaluation. arXiv:2507.02306. https://arxiv.org/abs/2507.02306
8. Rössler, S. "We Ran an Experiment with Synthetic Users: Here's What We Found." Userbrain, 28 Apr 2026. https://www.userbrain.com/blog/synthetic-users-experiment/
9. Biddle, T. "AI vs. Human Usability Testing: A Comparative Analysis Using Loop11." Loop11, 4 Mar 2025. https://www.loop11.com/ai-vs-human-usability-testing-a-comparative-analysis-using-loop11/
10. Kelemen, F. Z., Sima, L., & Huppert, K. "Can AI take over usability testing? We put it to the test." UX Studio, 15 Nov 2024. https://www.uxstudioteam.com/ux-blog/ai-usability-test
11. Bisbee, J., Clinton, J. D., Dorff, C., Kenkel, B., & Larson, J. M. (2024). Synthetic Replacements for Human Survey Data? The Perils of Large Language Models. *Political Analysis*, 32(4), 401–416. https://doi.org/10.1017/pan.2024.5
12. Peng, T., Gui, G., Toubia, O., et al. (2025, rev. 2026). Digital Twins as Funhouse Mirrors: Five Key Distortions. arXiv:2509.19088. https://arxiv.org/abs/2509.19088
13. Wang, A., Morgenstern, J., & Dickerson, J. P. (2025). Large language models that replace human participants can harmfully misportray and flatten identity groups. *Nature Machine Intelligence*, 7(3), 400–411. https://arxiv.org/abs/2402.01908
14. User Interviews. "The State of Synthetic Users." May 2026. https://www.userinterviews.com/state-of-synthetic-users-report
15. Hullman, J., Broska, D., Sun, H., & Shaw, A. (2026). This human study did not involve human subjects: Validating LLM simulations as behavioral evidence. arXiv:2602.15785. https://arxiv.org/abs/2602.15785
