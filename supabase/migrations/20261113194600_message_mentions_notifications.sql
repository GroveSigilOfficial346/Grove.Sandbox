begin;

create or replace function public.notify_conversation_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  mention_match text[];
  target_username text;
  target_user_id uuid;
  notified_ids uuid[] := '{}'::uuid[];
begin
  if not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id = new.sender_id
  ) then
    return new;
  end if;

  for mention_match in
    select regexp_matches(
      coalesce(new.body, ''),
      '(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,30})([^A-Za-z0-9_]|$)',
      'g'
    )
  loop
    target_username := lower(mention_match[2]);

    select p.id
      into target_user_id
    from public.profiles p
    where lower(p.username) = target_username
    limit 1;

    if target_user_id is null
       or target_user_id = new.sender_id
       or target_user_id = any(notified_ids) then
      continue;
    end if;

    if not exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = new.conversation_id
        and cm.user_id = target_user_id
    ) then
      continue;
    end if;

    if exists (
      select 1
      from public.user_preferences up
      where up.user_id = target_user_id
        and up.notify_mentions = false
    ) then
      continue;
    end if;

    insert into public.notifications (
      recipient_id,
      actor_id,
      kind,
      message
    )
    values (
      target_user_id,
      new.sender_id,
      'mention',
      'mentioned you in a message.'
    );

    notified_ids := array_append(notified_ids, target_user_id);
    target_user_id := null;
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_conversation_message_mentions()
from public, anon, authenticated;

drop trigger if exists
  conversation_message_mentions_notification
on public.conversation_messages;

create trigger conversation_message_mentions_notification
after insert on public.conversation_messages
for each row
execute function public.notify_conversation_message_mentions();

commit;
