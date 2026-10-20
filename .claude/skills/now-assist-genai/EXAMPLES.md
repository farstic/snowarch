# Now Assist / GenAI (Reference) v1.0 — Worked Examples

This is a *reference* skill, so its examples are grounded Q&A — not buildable designs. The moment a question turns into "design/build it," hand off to the **Now Assist Specialist**.

---

## Example 1 — "Can Now Assist summarise CSM cases, and what powers it?"

**Answer.** Yes. Case/incident **summarization** is an out-of-box Now Assist skill, enabled and tuned in the AI Admin Hub console *(citation: markdown/intelligent-experiences/configure-a-now-assist-skill.md)*. It runs on the model provider selected for the skill — the **Now LLM Service** (a ServiceNow hosted model) or a supported third-party LLM; developers use the **Generative AI Controller** with your own third-party LLM licenses. *(citation: markdown/intelligent-experiences/edit-model-providers.md, markdown/intelligent-experiences/servicenow-large-language-model-now-llm/now-llm-model-updates.md, markdown/intelligent-experiences/exploring-now-assist-platform.md)*

**Release note.** Confirm the specific summarization skill is GA in your engagement's release family before committing to it.

**Hand-off.** If you want this *designed* — when it fires (resolution vs on-open), what the prompt includes, low-confidence routing — that's a **Now Assist Specialist** task.

---

## Example 2 — "How do we govern which AI features are on, and can we use our own LLM?"

**Answer.** **AI Control Tower** is the governance surface — discover, monitor, manage, and audit AI features (ServiceNow and third-party) across the instance. Third-party model routing (**bring-your-own-LLM**) is configured through that governance layer rather than by each feature calling a model directly. *(citation: markdown/intelligent-experiences/ai-control-tower/ai-control-tower-landing.md, markdown/intelligent-experiences/ai-control-tower/configure-third-party-llms-using-ai-control-tower.md)*

**§1.1 note (for the builder).** Enabling OOB skills and configuring Control Tower is configuration. A **custom** skill (AI Skill Kit) over baseline tables is configuration too; **new tables/scopes/Connection Aliases** behind a custom skill or agent are §1.1 — flag for the Now Assist Specialist + Chief Architect.

---

## Reading these examples

- Reference answers are **grounded in a cited doc** and **flag release-sensitivity** — Now Assist moves fast.
- Anything that becomes "design it / build it" is handed to the **Now Assist Specialist**; this skill stops at reference.

---

*End of Now Assist / GenAI reference EXAMPLES.md v1.0.*
