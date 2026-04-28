# PR Description Writer

When asked to write or improve a pull-request description, produce a concise, reviewer-friendly summary using this structure:

## What changed
One or two sentences explaining **what** was modified and at a high level **why**. Focus on the outcome, not the implementation details.

## Motivation
A short paragraph or bullet list explaining the problem being solved or the improvement being made. Link to the relevant issue or ticket if one exists (e.g. `Closes #123`).

## How it works (optional)
Only include this section if the approach is non-obvious. Summarise the key design decision and any trade-offs made.

## Test plan
A brief checklist of manual or automated checks a reviewer or QA engineer should run:
- [ ] Unit tests pass (`npm test` / `pytest`)
- [ ] <any relevant manual test steps>
- [ ] No regressions in related areas

## Checklist
- [ ] Changes are backward-compatible (or breaking changes are documented)
- [ ] Documentation updated if behaviour changed
- [ ] No secrets or credentials committed

---
**Style rules**
- Use present tense ("Add support for…" not "Added…").
- Keep the title under 72 characters.
- Avoid jargon; write as if the reviewer has not seen this code before.
