-- This function is only used by database triggers and should not be callable by clients.

revoke execute on function public.sync_financial_goals_with_wallet(uuid) from public;
revoke execute on function public.sync_financial_goals_with_wallet(uuid) from anon;
revoke execute on function public.sync_financial_goals_with_wallet(uuid) from authenticated;
