# Session 09: CI Gate and Go/No-Go Report

Paste this into a new Claude Code session:

```md
# Continuity
Continue from Session 08 artifacts.

# Mission
Run the full CI checklist, fix every failure at root cause, add the GitHub Actions workflow, and produce a go/no-go report.

# Repository anchors
- package.json (scripts: check, test, build)
- supabase/migrations/*.sql
- src/**/*.{ts,tsx} (entire codebase)
- .github/workflows/ (to create)
- docs/roadmap/alextepresta/

# Tasks
1. Iterate the following until each is green; do not skip, downgrade, or silence anything:
   a. `npm install` (verify lockfile is clean and committed).
   b. `npm run check` (TypeScript strict + ESLint, zero warnings).
   c. `npx vitest run --coverage` (all suites pass; record coverage % for `src/lib/domain/**`).
   d. `npm run build` (Next.js production build).
   e. Replay all migrations on a fresh local DB (`supabase db reset`) and capture output.
   f. Run `runMonthlyAccrual` against seeded data for two consecutive periods and assert idempotency on the second run.
2. For every failure, fix the root cause. If a fix requires a non-trivial design change, write or update an ADR under `docs/adr/` before implementing the change.
3. Verify RLS by running the manual queries documented in Session 02's handoff against (a) anon JWT, (b) debtor JWT, (c) admin JWT. Record results in a table inside the report.
4. Run a final manual smoke test end-to-end and transcribe the steps + outcomes into the report:
   - admin signs in → creates invite
   - second account accepts invite → becomes debtor
   - admin creates a debt for the debtor (PRD example: ₡591,500 / 4 / day 25)
   - debtor submits a partial payment of ₡100,000 against the first installment
   - admin approves → installment status='converted', interest_debt principal=₡47,875 created
   - simulation toggle works on debtor home; banner appears; no DB writes
5. Add `.github/workflows/ci.yml`: trigger on push and PR to `main`; Node from `.nvmrc`; runs `npm ci && npm run check && npx vitest run && npm run build`. Cache `~/.npm`.
6. Produce `docs/roadmap/alextepresta/ci-go-no-go.md` containing: each command + exit code, coverage report, RLS verification table, manual smoke transcript, list of any deferred work, and an explicit `GO` or `NO-GO` decision with rationale.

# Deliverables
- .github/workflows/ci.yml
- All fixes committed
- docs/roadmap/alextepresta/ci-go-no-go.md
- docs/roadmap/alextepresta/session-09-handoff.md (final epic summary linking every prior handoff)

# Quality gates (must all pass and be re-run after every fix)
- `npm run check`
- `npx vitest run`
- `npm run build`
- Migration replay (`supabase db reset`) is clean
- RLS verification queries return the expected rows for each role

# Exit criteria
- Every gate above is green on a fresh clone.
- The CI workflow runs green on a test branch (push and observe).
- `ci-go-no-go.md` exists with an explicit GO or NO-GO and supporting evidence.
```
