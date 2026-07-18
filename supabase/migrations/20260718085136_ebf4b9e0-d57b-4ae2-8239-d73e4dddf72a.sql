-- Lock down public read access to transactions.
-- Raw SMS content, sender names, bank identifiers and partial account numbers
-- must not be readable via the anon or authenticated Data API roles.
-- Reads now go through the /api/transactions serverless function using the service role.

DROP POLICY IF EXISTS "Public can read transactions" ON public.transactions;

REVOKE SELECT ON public.transactions FROM anon;
REVOKE SELECT ON public.transactions FROM authenticated;

-- Keep service_role full access (it bypasses RLS anyway, but be explicit).
GRANT ALL ON public.transactions TO service_role;

-- RLS remains enabled; with no SELECT policy for anon/authenticated the Data API
-- will not return any rows to those roles.
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;