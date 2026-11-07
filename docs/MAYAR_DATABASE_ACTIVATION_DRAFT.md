# AgentSaya Mayar — database activation design (NOT APPLIED)

The AgentSaya Supabase connector was verified against project `ffhoxukvezdzwronpuos` (read-only inspection only). Existing tables have `agents.transaction_id` UUID FK and `transactions.merchant_ref`, `reference`, `package_id`, `amount`, `agent_id` and `payment_status`.

CRITICAL: Existing `public.activate_agent(text,text)` is SECURITY DEFINER, executable by `PUBLIC`, `anon` and `authenticated`, does not itself verify a gateway payment, refers to missing `transactions.paid_at`, and only updates agent rows with `agents.transaction_id = tx.id`. **Do not expose production checkout until this is remediated in a separately approved database change.**

## Proposed database migration (review, test, approve before applying)

This is a design draft, not a migration applied to production. Use the Supabase CLI migration workflow to create and validate the migration file before running it.

```sql
begin;

-- Close an existing public payment activation privilege. Do not alter its
-- implementation here: keep legacy code compatibility for service_role.
revoke all on function public.activate_agent(text, text) from public, anon, authenticated;
grant execute on function public.activate_agent(text, text) to service_role;

create unique index if not exists mayar_provider_tx_unique
  on public.transactions (reference)
  where payment_method = 'mayar' and reference is not null;

create unique index if not exists mayar_merchant_ref_unique
  on public.transactions (merchant_ref)
  where payment_method = 'mayar' and merchant_ref is not null;

create or replace function public.activate_mayar_agent(
    p_merchant_ref text,
    p_provider_transaction_id text,
    p_verified_amount numeric,
    p_verified_email text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx public.transactions%rowtype;
  v_agent public.agents%rowtype;
  v_days integer;
  v_now timestamptz := transaction_timestamp();
begin
  -- Only trusted backend service_role can call; webhook first verifies via
  -- Mayar API. Never accept an unauthenticated client-side payment status.
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  select * into v_tx from public.transactions
   where merchant_ref = p_merchant_ref and reference = p_provider_transaction_id
     and payment_method = 'mayar'
   for update;

  if not found then raise exception 'transaction not found'; end if;

  if v_tx.status = 'PAID' then return false; end if;
  if v_tx.status <> 'UNPAID' or v_tx.payment_status <> 'PENDING'
     or v_tx.agent_id is null or v_tx.amount <> p_verified_amount
     or lower(trim(v_tx.customer_email)) <> lower(trim(p_verified_email))
  then raise exception 'transaction data mismatch'; end if;

  if v_tx.package_id = 'yearly' then v_days := 365;
  elsif v_tx.package_id = 'plan-basic' then v_days := 30;
  else raise exception 'invalid package'; end if;

  select * into v_agent from public.agents where id = v_tx.agent_id for update;
  if not found then raise exception 'agent not found'; end if;

  update public.transactions set status = 'PAID', payment_status = 'PAID'
   where id = v_tx.id;

  update public.agents set
    payment_status = 'PAID',
    status = 'active',
    plan_tier = case when v_days = 365 then 'yearly' else 'basic' end,
    period_start = case
       when period_end is not null and period_end > v_now then period_start
       else v_now end,
    period_end = greatest(coalesce(period_end, v_now), v_now)
       + make_interval(days => v_days),
    transaction_id = v_tx.id,
    updated_at = v_now
  where id = v_agent.id;

  return true;
end;
$$;

revoke all on function public.activate_mayar_agent(text, text, numeric, text)
 from public, anon, authenticated;
grant execute on function public.activate_mayar_agent(text, text, numeric, text)
 to service_role;

commit;
```

## Before approval
- Verify grants, actual RPC signature, legacy webhook reliance, and whether `auth.role()` check works with the Supabase service client.
- Existing schema includes defaults with `status='SUCCESS'` and `payment_method='MOCK'`; explicit values are required on all paid order inserts.
- Confirm database types and uniqueness against actual existing data; create migration in CLI then test in disposable environment before applying.
- Simulate concurrent duplicate webhooks (only one 30/365-day extension), new PENDING agent, trial upgrade, renewal while active, renewal while expired, wrong amount, wrong email, replay, invalid plan, and missing API credentials.
- Do not register a merchant-level Mayar webhook until existing app receivers are accounted for.
