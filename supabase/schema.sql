-- ============================================
-- Simple Therapy — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Profiles (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('therapist', 'patient', 'caregiver')),
  full_name text not null,
  email text not null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Everyone can read profiles (needed for name lookups)
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Users can insert their own profile on signup
create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);


-- 2. Patient Assignments (links therapists/caregivers to patients)
create table public.patient_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid not null references public.profiles(id) on delete cascade,
  relationship text not null check (relationship in ('therapist', 'caregiver')),
  created_at timestamptz default now(),
  unique (patient_id, assigned_to)
);

alter table public.patient_assignments enable row level security;

-- Therapists can see their own assignments
create policy "Therapists see own assignments"
  on public.patient_assignments for select
  to authenticated
  using (
    assigned_to = auth.uid()
    or patient_id = auth.uid()
  );

-- Therapists can create assignments
create policy "Therapists can create assignments"
  on public.patient_assignments for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'therapist'
    )
  );

-- Therapists can delete assignments
create policy "Therapists can delete assignments"
  on public.patient_assignments for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'therapist'
    )
  );


-- 3. Task Templates (reusable task blueprints)
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  duration_minutes int not null default 15,
  therapy_type text not null check (therapy_type in ('speech', 'occupational', 'physical')),
  created_at timestamptz default now()
);

alter table public.task_templates enable row level security;

-- Therapists can see their own templates
create policy "Therapists see own templates"
  on public.task_templates for select
  to authenticated
  using (
    therapist_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'therapist'
    )
  );

-- Patients can read templates for tasks assigned to them
create policy "Patients can read templates for their assigned tasks"
  on public.task_templates for select
  to authenticated
  using (
    exists (
      select 1 from public.task_assignments
      where task_assignments.template_id = task_templates.id
        and task_assignments.patient_id = auth.uid()
    )
  );

-- Therapists can create templates
create policy "Therapists can create templates"
  on public.task_templates for insert
  to authenticated
  with check (
    therapist_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'therapist'
    )
  );

-- Therapists can update their own templates
create policy "Therapists can update own templates"
  on public.task_templates for update
  to authenticated
  using (therapist_id = auth.uid());

-- Therapists can delete their own templates
create policy "Therapists can delete own templates"
  on public.task_templates for delete
  to authenticated
  using (therapist_id = auth.uid());


-- 4. Task Assignments (tasks assigned to patients per day)
create table public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.task_templates(id) on delete set null,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  therapist_id uuid not null references public.profiles(id) on delete cascade,
  assigned_date date not null default current_date,
  assigned_time_of_day text not null default 'morning'
    check (assigned_time_of_day in ('morning', 'afternoon', 'evening')),
  title text,
  description text,
  duration_minutes int,
  therapy_type text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed')),
  details text,
  completed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.task_assignments enable row level security;

-- Therapists see assignments they created
create policy "Therapists see own task assignments"
  on public.task_assignments for select
  to authenticated
  using (
    therapist_id = auth.uid()
    or patient_id = auth.uid()
    or exists (
      select 1 from public.patient_assignments
      where patient_id = task_assignments.patient_id
        and assigned_to = auth.uid()
    )
  );

-- Therapists can create task assignments
create policy "Therapists can assign tasks"
  on public.task_assignments for insert
  to authenticated
  with check (
    therapist_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'therapist'
    )
  );

-- Patients can update their own task status; therapists can update tasks they assigned
create policy "Patients and therapists can update task assignments"
  on public.task_assignments for update
  to authenticated
  using (
    patient_id = auth.uid()
    or therapist_id = auth.uid()
  );

-- Therapists can delete task assignments they created
create policy "Therapists can delete task assignments"
  on public.task_assignments for delete
  to authenticated
  using (therapist_id = auth.uid());


-- 5. Caregiver Notes
create table public.caregiver_notes (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

alter table public.caregiver_notes enable row level security;

-- Caregivers see their own notes; therapists see notes for their patients
create policy "View caregiver notes"
  on public.caregiver_notes for select
  to authenticated
  using (
    caregiver_id = auth.uid()
    or exists (
      select 1 from public.patient_assignments
      where patient_id = caregiver_notes.patient_id
        and assigned_to = auth.uid()
        and relationship = 'therapist'
    )
  );

-- Caregivers can insert notes for their assigned patients
create policy "Caregivers can create notes"
  on public.caregiver_notes for insert
  to authenticated
  with check (
    caregiver_id = auth.uid()
    and exists (
      select 1 from public.patient_assignments
      where patient_id = caregiver_notes.patient_id
        and assigned_to = auth.uid()
        and relationship = 'caregiver'
    )
  );


-- 6. Note Replies
create table public.note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.caregiver_notes(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

alter table public.note_replies enable row level security;

-- Visible to the note's caregiver and assigned therapists
create policy "View note replies"
  on public.note_replies for select
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.caregiver_notes
      where id = note_replies.note_id
        and (
          caregiver_id = auth.uid()
          or exists (
            select 1 from public.patient_assignments
            where patient_id = caregiver_notes.patient_id
              and assigned_to = auth.uid()
              and relationship = 'therapist'
          )
        )
    )
  );

-- Therapists and caregivers can reply
create policy "Authenticated users can reply to notes"
  on public.note_replies for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.caregiver_notes
      where id = note_replies.note_id
        and (
          caregiver_id = auth.uid()
          or exists (
            select 1 from public.patient_assignments
            where patient_id = caregiver_notes.patient_id
              and assigned_to = auth.uid()
              and relationship = 'therapist'
          )
        )
    )
  );


-- ============================================
-- Indexes for performance
-- ============================================
create index idx_patient_assignments_patient on public.patient_assignments(patient_id);
create index idx_patient_assignments_assigned on public.patient_assignments(assigned_to);
create index idx_task_assignments_patient_date on public.task_assignments(patient_id, assigned_date);
create index idx_task_assignments_therapist on public.task_assignments(therapist_id);
create index idx_caregiver_notes_patient on public.caregiver_notes(patient_id);
create index idx_note_replies_note on public.note_replies(note_id);
create index idx_task_templates_therapist on public.task_templates(therapist_id);


-- ============================================
-- Auto-create profile on signup (trigger)
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'patient'),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
