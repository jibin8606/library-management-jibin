# AI notes

## Tools used
- **Claude (Anthropic)** generated the initial code for the whole project from the exam paper: Express API, Mongoose
  models, seed script, React client, tests and documentation.

## What the AI was used for
Scaffolding all layers, the R6 approach (atomic conditional `findOneAndUpdate`), the fine unit-test cases, and the docs.

## Things the AI got wrong / had to be fixed while building
1. **Partial unique index on a null field.** The first design for R5 was to use
   `partialFilterExpression: { returnedAt: null }`. MongoDB partial indexes do not support `null`/`$eq: null` filters, so the
   rule would not have been enforced. Caught before it was written into the models; fixed by adding a boolean `active` field and indexing `{ active: true }`.
2. **Shell scaffolding.** The first setup command used `{a,b}` brace expansion in `sh`, which created no directories and
   the file writes failed; caught from the error output and redone.
3. **Not verified against a real database.** The AI had no MongoDB available while writing this, so the integration
   tests were never executed there. The author must run `npm test` locally and read the output.

## Author's own notes (fill in before the discussion)
- Which parts I reviewed line by line:
- Things I changed after running it:
- One more thing the AI got wrong that I found:
