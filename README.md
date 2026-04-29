# AlexTePresta

Web app for managing personal loans (family/friends): zero-rate debts structured in installments, automatic conversion to compound-interest sub-debts on partial payments, and a parallel simulation mode that never affects real balances.

Stack: Next.js 15 (App Router) · TypeScript strict · Tailwind · Supabase (Postgres + Auth + RLS) · Vercel.

## Documentation

- **[Development guide](docs/DEVELOPMENT.md)** — setup, local Supabase, dev server, quality gates, manual smoke test, RLS verification, deploy env vars.
- [Architecture charter](docs/architecture/charter.md) and [data model](docs/architecture/data-model.md)
- [Payment pipeline spec](docs/architecture/payment-pipeline.md) and [interest model](docs/architecture/interest-model.md)
- [ADRs](docs/adr/)
