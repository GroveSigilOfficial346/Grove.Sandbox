begin;

create or replace view public.profile_directory
with (security_invoker = false, security_barrier = true)
as
select
  id,
  username,
  display_name,
  case when not is_private then bio else null end as bio,
  avatar_url,
  cover_url,
  case when not is_private then created_at else null end as created_at,
  case when not is_private then updated_at else null end as updated_at,
  case when not is_private then location else null end as location,
  case when not is_private then website else null end as website,
  case when not is_private then pronouns else null end as pronouns,
  account_type,
  is_private,
  case when not is_private then profile_music_url else null end as profile_music_url,
  case when not is_private then profile_music_title else null end as profile_music_title,
  case when not is_private then profile_music_artist else null end as profile_music_artist,
  case when not is_private then profile_music_enabled else false end as profile_music_enabled,
  case when not is_private then allow_image_downloads else false end as allow_image_downloads,
  case when not is_private then allow_image_saves else false end as allow_image_saves,
  case when not is_private then allow_music_downloads else false end as allow_music_downloads,
  case when not is_private then relationship_status else 'not_set' end as relationship_status
from public.profiles;

comment on view public.profile_directory is
  'Intentional owner-privileged directory projection. Only whitelisted identity fields are exposed for private accounts; private profile content is null until the viewer has access to the base profiles row.';

revoke insert, update, delete, truncate, references, trigger
on public.profile_directory
from anon, authenticated;

grant select on public.profile_directory
to anon, authenticated;

grant update (avatar_url, cover_url)
on public.profiles
to authenticated;

commit;
