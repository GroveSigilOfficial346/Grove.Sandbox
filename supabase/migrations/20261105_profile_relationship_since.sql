-- Grove.Sandbox profile relationship date.
-- This is a display date on the profile owner's own record.
-- It does not represent partner approval or a mutually confirmed relationship.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS relationship_since date;

COMMENT ON COLUMN public.profiles.relationship_since IS
'Optional relationship date displayed on the profile by its owner.';
