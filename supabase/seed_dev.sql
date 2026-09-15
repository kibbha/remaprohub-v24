
-- Optional development seed (run only after creating a test Auth user).
-- Replace USER_UUID below with the Auth user's UUID.

-- select id, email from auth.users;

-- insert into public.organizations (name, legal_name, country_code, default_currency)
-- values ('ReMaPro Test Network', 'ReMaPro Test Network SA', 'CH', 'CHF')
-- returning id;

-- insert into public.restaurants (organization_id, name, city, canton, country_code, currency)
-- values ('ORG_UUID', 'Restaurant Test', 'Geneva', 'GE', 'CH', 'CHF')
-- returning id;

-- insert into public.memberships (user_id, organization_id, restaurant_id, role)
-- values ('USER_UUID', 'ORG_UUID', 'RESTAURANT_UUID', 'network_admin');
