# Mayar production integration — audit and rollout gate

Date: 2026-11-07. Work branch: `feature/mayar-production-checkout-20261107`.

## Verified facts
- Vercel project `agentsaya` has `MAYAR_API_KEY` as a **sensitive**, **Production-only** environment variable. No value was read.
- Next.js App Router application has `app/api/checkout/route.ts`, `app/api/webhooks/ipaymu/route.ts`, and `app/api/transaction/status/route.ts`.
- Price source `lib/plans.ts`: trial 3 days, monthly IDR 49,000 for 30 days, yearly IDR 399,000 for 365 days.
- `app/dashboard/page.tsx` links trial upgrades to `/checkout?slug=...&renewal=true`.
- Read-only Supabase connector does not expose the AgentSaya project's database. Database schema/RPC behavior **not independently verified**.

## Critical pre-existing payment risks (must repair before release)
1. Paid-agent creation in `app/api/checkout/route.ts` writes `payment_status: 'PAID'`, `status: 'active'` and immediate period dates **before** payment confirmation.
2. Renewal checkout immediately changes the agent to PAID and extends `period_end` before payment.
3. `isMockMode = !IPAYMU_API_KEY || !IPAYMU_VA` can produce a PAID transaction without a real provider payment. Payment production must fail closed, never fall back to mock.
4. `/api/transaction/status` is publicly queryable using only a merchant reference; restrict returned customer metadata and avoid unauthenticated write operations.
5. `shareUrl` points to localhost; do not deliver that URL to a production user.
6. Existing `activate_agent` RPC behavior for annual and renewal plans is unknown. It must be inspected before reuse.

## Desired production flow
- Server validates plan and expected amount from `lib/plans.ts`, never trusts a browser-provided price.
- Store a PENDING transaction + inactive new agent. Existing agent remains unchanged for renewals until payment is verified.
- Create a Mayar v2 invoice via `lib/mayar.ts` with `extraData: { app:'agentsaya', merchantRef, agentId, plan, renewal }`. Persist the Mayar invoice and transaction identifiers, with a UNIQUE index on provider transaction ID.
- Redirect only to provider-returned HTTPS link.
- Webhook `payment.received` is a **hint**, not authorization: look up exact Mayar transaction ID through Mayar v2 API, require status `paid`, expected amount, matching customer and stored provider identifiers; then activate via one atomic, idempotent database procedure.
- Same activation must be callable by an authenticated reconciliation job if webhook delivery fails.
- Return page never grants access; it only reads a sanitized payment/agent status.
- Trial remains payment-free.
- One merchant-level Mayar webhook URL: do NOT change its setting until other apps' routing is inspected. Shared router may be required.

## Release prerequisites (not complete)
- [x] Dedicated Git branch created without changing main.
- [x] Mayar API v2 invoice/transaction client written.
- [ ] Inspect AgentSaya Supabase schema, payment constraints, `activate_agent` SQL, and migration history.
- [ ] Implement pending checkout for new and renewal, provider ID storage, webhook/reconciliation and atomic activation.
- [ ] Verify if the Mayar account already has a webhook consumer (shared-merchant safety).
- [ ] Verify signed-in renewal ownership and prevent arbitrary-slug upgrades.
- [ ] Build/typecheck + mock-provider tests for unpaid, paid, duplicate webhook, amount mismatch, annual renewal, replay, cancellation and expiry.
- [ ] Test with an explicitly authorized real small-value payment.
- [ ] Obtain explicit owner approval before merge **or any production deployment**.

## Documentation
- https://docs.mayar.id/api-reference-v2/invoice/create
- https://docs.mayar.id/api-reference-v2/transaction/detail
- https://docs.mayar.id/api-reference-v2/webhook/registerurlhook
- https://docs.mayar.id/integration/webhook

No live Mayar invoice was created, merchant webhook configuration was not changed, and no production deploy was performed.
