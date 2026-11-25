import test from 'node:test';
import assert from 'node:assert/strict';
import { requireMayarConfigured, readSandboxPaymentStatus, verifyAgentSayaSettlement, createAgentSayaPayment, mayarDescription } from '../lib/mayar.ts';

const orderId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const transactionId = '33333333-3333-4333-8333-333333333333';
const input = { orderId, requestId, initialTransactionId: transactionId, amount: 49000, plan: 'monthly', email: 'qa@example.com' };
const detail = { id: requestId, amount: 49000, type: 'payment_request', description: mayarDescription(orderId, 'monthly'), status: 'paid' };
const tx = { id: transactionId, status: 'paid', amount: 49000, paymentLink: { id: requestId }, customer: { email: input.email }, extraData: { orderId } };
const original = globalThis.fetch;
function env(mode) {
  process.env.MAYAR_ENV = mode;
  process.env.MAYAR_ENABLE_LIVE_CHECKOUT = 'true';
  process.env.MAYAR_API_KEY = 'test-production-key';
  process.env.MAYAR_SANDBOX_API_KEY = 'test-sandbox-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  delete process.env.MAYAR_SANDBOX_API_BASE;
}
function mock(handler) {
  globalThis.fetch = async (url, opts) => {
    const data = handler(String(url), opts);
    return new Response(JSON.stringify({ statusCode: 200, data }), { status: 200 });
  };
}
test.afterEach(() => { globalThis.fetch = original; });
test('disabled environment fails closed', () => {
  env('disabled');
  assert.throws(() => requireMayarConfigured());
});
test('sandbox payment verified without real settlement', async () => {
  env('sandbox');
  mock(url => { assert.match(url, /api\.mayar\.io/); return detail; });
  assert.equal(await readSandboxPaymentStatus(input), 'SANDBOX_PAID');
  assert.equal(await verifyAgentSayaSettlement(input), null);
});
test('sandbox wrong amount rejected', async () => {
  env('sandbox');
  mock(() => ({ ...detail, amount: 1 }));
  await assert.rejects(readSandboxPaymentStatus(input));
});
test('live pending request never settles', async () => {
  env('production');
  mock(() => ({ ...detail, status: 'unpaid' }));
  assert.equal(await verifyAgentSayaSettlement(input), null);
});
test('live verified transaction matches request, email and amount', async () => {
  env('production');
  mock(url => url.includes('/transactions/') ? tx : detail);
  assert.equal(await verifyAgentSayaSettlement(input), transactionId);
});
test('live paid request alone never settles', async () => {
  env('production');
  mock(url => url.includes('/transactions/') ? { ...tx, status: 'created' } : detail);
  assert.equal(await verifyAgentSayaSettlement(input), null);
});
test('live mismatched paid amount rejected', async () => {
  env('production');
  mock(url => url.includes('/transactions/') ? { ...tx, amount: 1 } : detail);
  await assert.rejects(verifyAgentSayaSettlement(input));
});
test('live wrong email rejected', async () => {
  env('production');
  mock(url => url.includes('/transactions/') ? { ...tx, customer: { email: 'other@example.com' } } : detail);
  await assert.rejects(verifyAgentSayaSettlement(input));
});
test('create refuses a caller-controlled amount', async () => {
  env('production');
  await assert.rejects(createAgentSayaPayment({ orderId, plan: 'monthly', amount: 1, email: input.email, phone: '' }));
});
test('untrusted checkout link rejected', async () => {
  env('sandbox');
  mock(url => url.endsWith('/create') ? { id: requestId, transactionId, link: 'https://example.com/pl/abcdef' } : detail);
  await assert.rejects(createAgentSayaPayment({ orderId, plan: 'monthly', amount: 49000, email: input.email, phone: '' }));
});

// Static safety guardrails for the DB migration and recovery gate.
import { readFileSync } from 'node:fs';
test('database migration revokes public payment activation and owner data access', () => {
  const migration = readFileSync('supabase/migrations/20261111192800_mayar_mvp_secure_settlement.sql', 'utf8');
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.activate_agent/);
  assert.match(migration, /REVOKE SELECT \(%s\), INSERT \(%s\), UPDATE \(%s\), REFERENCES \(%s\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.finalize_mayar_agent_payment/);
  assert.match(migration, /CREATE POLICY "public_chat_read"/);
  assert.ok(migration.includes("DO $"));
  assert.ok(!migration.includes("DO $\n"));
  assert.ok(!migration.split("\n").some(line => ["BEGIN;","COMMIT;"].includes(line.trim())));
});
test('payment recovery is authenticated, bounded and cannot settle sandbox', () => {
  const source = readFileSync('lib/mayar-recovery.ts', 'utf8');
  const dashboard = readFileSync('app/api/dashboard/agents/route.ts', 'utf8');
  assert.match(source, /if \(!isMayarLive\(\)/);
  assert.match(source, /\.limit\(2\)/);
  assert.match(source, /verifyAgentSayaSettlement/);
  assert.match(source, /finalize_mayar_agent_payment/);
  assert.match(dashboard, /getSessionUser\(req\)/);
  assert.ok(dashboard.indexOf('getSessionUser(req)') < dashboard.indexOf('recoverPendingMayarOrdersForOwner(user.email)'));
});
