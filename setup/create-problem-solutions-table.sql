-- Problem Solutions table for comparative depth questioning
-- Safe to run multiple times: create-if-not-exists patterns

-- Enable UUID generation if available
create extension if not exists pgcrypto;

create table if not exists public.problem_solutions (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null,
  approach_key text not null,
  title text not null,
  summary text,
  steps jsonb,
  pros jsonb,
  cons jsonb,
  time_complexity text,
  space_complexity text,
  tags text[],
  confidence int,
  version int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_problem_approach unique (problem_id, approach_key)
);

create index if not exists idx_problem_solutions_problem_id on public.problem_solutions (problem_id);

-- Basic RLS: allow reads to authenticated users, writes only to admins
alter table public.problem_solutions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'problem_solutions' and policyname = 'Allow read for authenticated'
  ) then
    create policy "Allow read for authenticated" on public.problem_solutions
      for select
      to authenticated
      using ( true );
  end if;
end $$;

-- Admin-only write policies; assumes a Users table with role column = 'admin'
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'problem_solutions' and policyname = 'Allow admin insert'
  ) then
    create policy "Allow admin insert" on public.problem_solutions
      for insert
      to authenticated
      with check (
        exists (
          select 1 from public."Users" u 
          where u.id = auth.uid() and u.role = 'admin'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'problem_solutions' and policyname = 'Allow admin update'
  ) then
    create policy "Allow admin update" on public.problem_solutions
      for update
      to authenticated
      using (
        exists (
          select 1 from public."Users" u 
          where u.id = auth.uid() and u.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public."Users" u 
          where u.id = auth.uid() and u.role = 'admin'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'problem_solutions' and policyname = 'Allow admin delete'
  ) then
    create policy "Allow admin delete" on public.problem_solutions
      for delete
      to authenticated
      using (
        exists (
          select 1 from public."Users" u 
          where u.id = auth.uid() and u.role = 'admin'
        )
      );
  end if;
end $$;

-- Update trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_problem_solutions_updated_at on public.problem_solutions;
create trigger trg_problem_solutions_updated_at
before update on public.problem_solutions
for each row execute function public.set_updated_at();


