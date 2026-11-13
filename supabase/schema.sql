-- Esquema para guardar los datos de cada usuario en Supabase.
-- Se ejecuta una sola vez en: Supabase → SQL Editor → New query → pegar → Run.
--
-- Cada usuario tiene UNA fila con todos sus datos (cuentas, movimientos, pagos fijos, planes...)
-- en formato JSON. Las reglas de seguridad (RLS) hacen que cada quien solo pueda leer y
-- escribir su propia fila, aunque la clave "anon" de la app sea pública.

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  -- Sube en 1 con cada guardado; evita que un dispositivo desactualizado pise a otro.
  version    integer     not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_delete_own" on public.user_data;

create policy "user_data_select_own" on public.user_data
  for select to authenticated using (auth.uid() = user_id);

create policy "user_data_insert_own" on public.user_data
  for insert to authenticated with check (auth.uid() = user_id);

create policy "user_data_update_own" on public.user_data
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_data_delete_own" on public.user_data
  for delete to authenticated using (auth.uid() = user_id);

-- Sin sesión iniciada no se puede tocar nada.
revoke all on public.user_data from anon;
