-- Storage bucket for the real surveyed campus photos (Assets/images/),
-- compressed and uploaded by scripts/prepare-photos.mjs. Public so the
-- uploaded URLs work directly in <img src>, same as any other photo_url.
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do nothing;
