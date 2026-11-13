begin;

revoke all privileges on table public.notifications
from anon, public, authenticated;

grant select, update on table public.notifications
to authenticated;

commit;
