-- Add an IMFORCE staff member (agent) by hand in Supabase.
--
-- STEP 1 (Supabase dashboard, not SQL):
--   Authentication -> Users -> "Add user" -> "Create new user"
--   Enter their work email and a temporary password, tick "Auto Confirm User".
--   (Supabase stores only a bcrypt hash of the password.)
--
-- STEP 2: In the SQL Editor, edit the three values below and run this script.
--   username:     what they type to sign in. Lowercase letters, numbers, dots,
--                 hyphens or underscores; 3-32 characters (e.g. thandi.mokoena)
--   display_name: their name as shown in the workspace (e.g. Thandi Mokoena)
--   email:        the same email used in step 1

insert into public.staff_profiles (user_id, username, display_name, active)
select id, 'thandi.mokoena', 'Thandi Mokoena', true
from auth.users
where email = lower('thandi@imforce.co.za')
on conflict (user_id) do update
  set username = excluded.username, display_name = excluded.display_name, active = true;

-- STEP 3: Check it worked (one row with the new username):
select u.email, p.username, p.display_name, p.active
from public.staff_profiles p
join auth.users u on u.id = p.user_id
order by p.display_name;

-- On their first sign-in at /admin they enter the username and password, then
-- scan a QR code with an authenticator app.
--
-- Other useful commands:
--   Rename / change username:
--     update public.staff_profiles set display_name = 'New Name', username = 'new.username'
--     where user_id = (select id from auth.users where email = 'thandi@imforce.co.za');
--   Remove access (keeps their history in the audit log):
--     update public.staff_profiles set active = false
--     where user_id = (select id from auth.users where email = 'thandi@imforce.co.za');
--   Lost phone (authenticator): delete their factor so they can set it up again:
--     delete from auth.mfa_factors
--     where user_id = (select id from auth.users where email = 'thandi@imforce.co.za');
--   Forget all their remembered devices (lost laptop):
--     update public.staff_trusted_devices set revoked_at = now()
--     where revoked_at is null
--       and user_id = (select id from auth.users where email = 'thandi@imforce.co.za');
