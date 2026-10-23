-- Relevé de cotes : base en ligne (Supabase).
-- À coller une seule fois dans Supabase > SQL Editor, puis « Run ».
-- Aucune clé secrète ici : la sécurité repose sur les règles d'accès ci-dessous (RLS).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.entreprises (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  code_invitation text not null unique,
  created_at timestamptz not null default now()
);

-- Un compte appartient à une seule entreprise, avec le rôle terrain ou bureau.
create table public.membres (
  user_id uuid primary key references auth.users (id) on delete cascade,
  entreprise_id uuid not null references public.entreprises (id) on delete cascade,
  nom text not null,
  email text not null default '',
  role text not null check (role in ('terrain', 'bureau')),
  created_at timestamptz not null default now()
);
create index membres_entreprise on public.membres (entreprise_id);

-- Tous les objets des téléphones (chantiers, ouvrages, photos, cotes…) dans une seule table :
-- « data » reprend l'objet du téléphone, sans les fichiers (photos, sons) rangés dans le stockage.
create table public.elements (
  id uuid primary key,
  entreprise_id uuid not null references public.entreprises (id) on delete cascade,
  table_name text not null,
  data jsonb not null default '{}',
  -- Date de modification sur le téléphone (ms) : la plus récente gagne.
  updated_at bigint not null,
  -- Suppression transmise aux autres téléphones.
  deleted boolean not null default false,
  modifie_par uuid,
  -- Date d'écriture sur le serveur : les téléphones lisent ce qui a changé depuis leur dernier passage.
  server_updated_at timestamptz not null default clock_timestamp()
);
create index elements_synchro on public.elements (entreprise_id, server_updated_at);

-- ---------------------------------------------------------------------------
-- Fonctions d'aide (security definer : elles lisent « membres » sans boucler sur les règles)
-- ---------------------------------------------------------------------------

create function public.mon_entreprise() returns uuid
language sql stable security definer set search_path = public as $$
  select entreprise_id from membres where user_id = auth.uid()
$$;

create function public.est_bureau() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'bureau' from membres where user_id = auth.uid()), false)
$$;

create function public.nouveau_code() returns text
language sql volatile set search_path = public as $$
  -- 8 caractères sans 0/O ni 1/I pour être dictés sans erreur.
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 8)
$$;

-- ---------------------------------------------------------------------------
-- Écriture d'un élément : la plus récente gagne, seul le bureau valide un ouvrage
-- ---------------------------------------------------------------------------

create function public.avant_ecriture_element() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ancien_valide boolean := false;
  nouveau_valide boolean;
  corrige boolean := false;
begin
  if tg_op = 'UPDATE' then
    if old.entreprise_id <> new.entreprise_id or old.table_name <> new.table_name then
      raise exception 'Élément d''une autre entreprise';
    end if;
    -- Une modification plus ancienne que celle déjà enregistrée est ignorée.
    if old.updated_at > new.updated_at then
      return null;
    end if;
    ancien_valide := coalesce(not old.deleted and old.data ->> 'statut' = 'valide', false);
  end if;

  if new.table_name = 'ouvrages' and not public.est_bureau() then
    nouveau_valide := coalesce(not new.deleted and new.data ->> 'statut' = 'valide', false);
    if nouveau_valide and not ancien_valide then
      -- Le terrain ne peut pas valider : l'ouvrage reste « relevé ».
      new.data := jsonb_set(new.data, '{statut}', '"releve"');
      corrige := true;
    elsif ancien_valide and not nouveau_valide and not new.deleted then
      -- Le terrain ne peut pas retirer une validation du bureau.
      new.data := jsonb_set(new.data, '{statut}', '"valide"');
      corrige := true;
    end if;
  end if;

  if corrige then
    -- Plus récent que la version du téléphone : il reprendra la version corrigée.
    new.updated_at := greatest(new.updated_at, case when tg_op = 'UPDATE' then old.updated_at else 0 end) + 1;
  end if;
  new.modifie_par := auth.uid();
  new.server_updated_at := clock_timestamp();
  return new;
end
$$;

create trigger avant_ecriture before insert or update on public.elements
for each row execute function public.avant_ecriture_element();

-- ---------------------------------------------------------------------------
-- Règles d'accès : chaque entreprise ne voit que ses données
-- ---------------------------------------------------------------------------

alter table public.entreprises enable row level security;
alter table public.membres enable row level security;
alter table public.elements enable row level security;

revoke all on public.entreprises, public.membres, public.elements from anon, authenticated;
-- Le code d'invitation n'est lisible que par le bureau, via code_invitation().
grant select (id, nom) on public.entreprises to authenticated;
grant select on public.membres to authenticated;
grant select, insert, update on public.elements to authenticated;

create policy "entreprise du membre" on public.entreprises for select to authenticated
  using (id = public.mon_entreprise());
create policy "membres de la même entreprise" on public.membres for select to authenticated
  using (entreprise_id = public.mon_entreprise());
create policy "lecture" on public.elements for select to authenticated
  using (entreprise_id = public.mon_entreprise());
create policy "ajout" on public.elements for insert to authenticated
  with check (entreprise_id = public.mon_entreprise());
create policy "modification" on public.elements for update to authenticated
  using (entreprise_id = public.mon_entreprise())
  with check (entreprise_id = public.mon_entreprise());

-- ---------------------------------------------------------------------------
-- Entreprise et membres (appelées depuis l'appli)
-- ---------------------------------------------------------------------------

create function public.creer_entreprise(nom_entreprise text, nom_membre text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if exists (select 1 from membres where user_id = auth.uid()) then
    raise exception 'Ce compte fait déjà partie d''une entreprise';
  end if;
  if coalesce(trim(nom_entreprise), '') = '' or coalesce(trim(nom_membre), '') = '' then
    raise exception 'Nom manquant';
  end if;
  insert into entreprises (nom, code_invitation) values (trim(nom_entreprise), nouveau_code()) returning id into e;
  insert into membres (user_id, entreprise_id, nom, email, role)
  values (auth.uid(), e, trim(nom_membre), coalesce(auth.jwt() ->> 'email', ''), 'bureau');
  return e;
end
$$;

create function public.rejoindre_entreprise(code text, nom_membre text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if exists (select 1 from membres where user_id = auth.uid()) then
    raise exception 'Ce compte fait déjà partie d''une entreprise';
  end if;
  if coalesce(trim(nom_membre), '') = '' then raise exception 'Nom manquant'; end if;
  select id into e from entreprises where code_invitation = upper(replace(trim(code), ' ', ''));
  if e is null then raise exception 'Code d''invitation inconnu'; end if;
  insert into membres (user_id, entreprise_id, nom, email, role)
  values (auth.uid(), e, trim(nom_membre), coalesce(auth.jwt() ->> 'email', ''), 'terrain');
  return e;
end
$$;

create function public.code_invitation() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_bureau() then raise exception 'Réservé au bureau'; end if;
  return (select code_invitation from entreprises where id = mon_entreprise());
end
$$;

create function public.nouveau_code_invitation() returns text
language plpgsql security definer set search_path = public as $$
declare
  c text := nouveau_code();
begin
  if not est_bureau() then raise exception 'Réservé au bureau'; end if;
  update entreprises set code_invitation = c where id = mon_entreprise();
  return c;
end
$$;

create function public.changer_role(membre uuid, nouveau_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_bureau() then raise exception 'Réservé au bureau'; end if;
  if nouveau_role not in ('terrain', 'bureau') then raise exception 'Rôle inconnu'; end if;
  if not exists (select 1 from membres where user_id = membre and entreprise_id = mon_entreprise()) then
    raise exception 'Membre inconnu';
  end if;
  update membres set role = nouveau_role where user_id = membre;
  if not exists (select 1 from membres where entreprise_id = mon_entreprise() and role = 'bureau') then
    raise exception 'Il faut garder au moins un compte bureau';
  end if;
end
$$;

create function public.retirer_membre(membre uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_bureau() then raise exception 'Réservé au bureau'; end if;
  if membre = auth.uid() then raise exception 'Impossible de se retirer soi-même'; end if;
  delete from membres where user_id = membre and entreprise_id = mon_entreprise();
end
$$;

revoke execute on function
  public.mon_entreprise(), public.est_bureau(), public.nouveau_code(),
  public.creer_entreprise(text, text), public.rejoindre_entreprise(text, text),
  public.code_invitation(), public.nouveau_code_invitation(),
  public.changer_role(uuid, text), public.retirer_membre(uuid)
from public, anon;
grant execute on function
  public.mon_entreprise(), public.est_bureau(),
  public.creer_entreprise(text, text), public.rejoindre_entreprise(text, text),
  public.code_invitation(), public.nouveau_code_invitation(),
  public.changer_role(uuid, text), public.retirer_membre(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Photos et sons : dossier privé par entreprise (« <entreprise>/<table>/<id>/<champ> »)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('fichiers', 'fichiers', false)
on conflict (id) do nothing;

create policy "fichiers : lecture" on storage.objects for select to authenticated
  using (bucket_id = 'fichiers' and (storage.foldername(name))[1] = public.mon_entreprise()::text);
create policy "fichiers : ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'fichiers' and (storage.foldername(name))[1] = public.mon_entreprise()::text);
create policy "fichiers : remplacement" on storage.objects for update to authenticated
  using (bucket_id = 'fichiers' and (storage.foldername(name))[1] = public.mon_entreprise()::text);
create policy "fichiers : suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'fichiers' and (storage.foldername(name))[1] = public.mon_entreprise()::text);
