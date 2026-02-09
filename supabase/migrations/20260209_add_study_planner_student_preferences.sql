-- Persist student study preferences for reuse across weeks
-- Stores subjects + exam boards + qualification level (GCSE/A_LEVEL) for Study Assistant and UI defaults.

create table if not exists public.study_planner_student_preferences (
  student_email text primary key,
  qualification_level text null,
  -- JSON array of objects: [{ "subject": "History", "exam_board": "AQA" }, ...]
  subjects jsonb null,
  default_exam_board text null,
  updated_at timestamptz not null default now()
);

alter table public.study_planner_student_preferences enable row level security;

create index if not exists study_planner_student_preferences_default_exam_board_idx
  on public.study_planner_student_preferences (default_exam_board);

create index if not exists study_planner_student_preferences_qualification_level_idx
  on public.study_planner_student_preferences (qualification_level);

