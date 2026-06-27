-- Normalize organization display name for printed documents and admin UI.
update public.organizations
set name = 'อรินยา พาณิชย์'
where name is distinct from 'อรินยา พาณิชย์';
