-- Source-of-truth schedule targets for VESPA Handbook curriculum planning.
-- Supports "hardcoded month with flexible assignment window" by storing:
--   - target_month
--   - tolerance_months (requested: 1)

begin;

create table if not exists public.activity_schedule_targets (
  id bigserial primary key,
  book text not null,
  activity_code text,
  knack_id text,
  canonical_name text not null,
  target_month text not null check (
    target_month in (
      'September','October','November','December',
      'January','February','March','April','May','June','July'
    )
  ),
  tolerance_months integer not null default 1 check (tolerance_months between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_activity_schedule_targets_book_name
  on public.activity_schedule_targets(book, canonical_name);

-- Refresh the Handbook schedule set.
delete from public.activity_schedule_targets
where book = 'VESPA Handbook';

insert into public.activity_schedule_targets
  (book, activity_code, knack_id, canonical_name, target_month, tolerance_months)
values
  -- September
  ('VESPA Handbook', null , '66e31b4b81c24402cfe24c29', '6 Types of Goal', 'September', 1),
  ('VESPA Handbook', 'VI3', '66c37906db0d0602d3cd07e9', 'Another 20 Questions', 'September', 1),
  ('VESPA Handbook', 'EF10', '66cb9078ae5c8a02d616501a', 'Becoming Indistractable', 'September', 1),
  ('VESPA Handbook', 'EF27', '66cb9078ae5c8a02d6165036', 'The Clarity Countdown (A safety system for difficult topics)', 'September', 1),

  -- October
  ('VESPA Handbook', 'EF1', '66cb9078ae5c8a02d616500c', 'Proactive vs Reactive', 'October', 1),
  ('VESPA Handbook', 'SY36', '66cb9078ae5c8a02d6165044', 'The Sunday Night Ritual', 'October', 1),
  ('VESPA Handbook', 'AT4', '66cb9078ae5c8a02d61650b4', 'NAF vs NAch', 'October', 1),
  ('VESPA Handbook', 'SY24', '66cb9078ae5c8a02d6165075', '1% Planning', 'October', 1),

  -- November
  ('VESPA Handbook', 'AT21', '66cb9078ae5c8a02d61650c9', '5,5,5', 'November', 1),
  ('VESPA Handbook', 'EF13', '66cb9078ae5c8a02d6165021', 'Disruption Cost and Deep Work', 'November', 1),
  ('VESPA Handbook', 'SY19', '66cb9078ae5c8a02d6165060', 'The Catch-Up Week', 'November', 1),
  ('VESPA Handbook', 'PR35', '66cb9078ae5c8a02d6165098', 'Cog P vs Cog A', 'November', 1),

  -- December
  ('VESPA Handbook', 'EF32', '66cb9078ae5c8a02d616503d', 'Red Flags and Rescue Plans', 'December', 1),
  ('VESPA Handbook', 'SY41', '66cb9078ae5c8a02d6165059', 'Boosters and Sappers (Energy Makes Time)', 'December', 1),
  ('VESPA Handbook', 'AT16', '66cb9078ae5c8a02d61650bb', 'Check Ahead, Check Back', 'December', 1),
  ('VESPA Handbook', 'AT26', '66cb9078ae5c8a02d61650de', 'The Myth of the Curve', 'December', 1),

  -- January
  ('VESPA Handbook', 'VI15', '66c37906db0d0602d3cd080a', 'A Question of Money', 'January', 1),
  ('VESPA Handbook', 'VI11', '66c37906db0d0602d3cd07ff', 'Ikigai', 'January', 1),
  ('VESPA Handbook', 'SY2', '66cb9078ae5c8a02d616504b', 'Night School', 'January', 1),
  ('VESPA Handbook', 'SY14', '66cb9078ae5c8a02d6165067', 'Have to, Ought to, Want to', 'January', 1),

  -- February
  ('VESPA Handbook', 'VI20', '66c37906db0d0602d3cd0815', 'Outcome Control', 'February', 1),
  ('VESPA Handbook', 'VI25', '66c37906db0d0602d3cd0820', 'The Paths are Well Lit', 'February', 1),
  ('VESPA Handbook', 'EF17', '66cb9078ae5c8a02d6165028', 'Questify', 'February', 1),
  ('VESPA Handbook', 'PR18', '66cb9078ae5c8a02d616507c', 'High & Low Utility', 'February', 1),

  -- March
  ('VESPA Handbook', 'EF9', '66cb9078ae5c8a02d6165013', 'The Peloton', 'March', 1),
  ('VESPA Handbook', 'SY6', '66cb9078ae5c8a02d616506e', 'Cornell Notes', 'March', 1),
  ('VESPA Handbook', 'PR23', '66cb9078ae5c8a02d6165083', 'Closed Book Notetaking', 'March', 1),
  ('VESPA Handbook', 'PR29', '66cb9078ae5c8a02d616508a', 'Verbal Recaps', 'March', 1),
  ('VESPA Handbook', 'AT39', '66cb9078ae5c8a02d61650d7', 'Think Three Positives', 'March', 1),

  -- April
  ('VESPA Handbook', 'EF22', '66cb9078ae5c8a02d616502f', 'Activating and Sustaining', 'April', 1),
  ('VESPA Handbook', 'PR33', '66cb9078ae5c8a02d6165091', 'Test Your Future Self', 'April', 1),
  ('VESPA Handbook', 'PR28', '66cb9078ae5c8a02d61650ad', 'Sticky Timetables', 'April', 1),
  ('VESPA Handbook', 'AT12', '66cb9078ae5c8a02d61650d0', 'O.D.A', 'April', 1),

  -- May
  ('VESPA Handbook', 'PR5', '66cb9078ae5c8a02d616509f', 'The Command Verb Table', 'May', 1),
  ('VESPA Handbook', 'PR40', '66cb9078ae5c8a02d61650a6', 'The Overnight Boost', 'May', 1),

  -- June
  ('VESPA Handbook', 'VI8', '66c37906db0d0602d3cd07f4', 'Sweet and Sour Summers', 'June', 1),
  ('VESPA Handbook', 'AT31', '66cb9078ae5c8a02d61650e5', 'Worst Case Scenarios', 'June', 1);

-- Helper view:
-- Expands each target row into "allowed months" using tolerance_months.
-- Useful for assignment logic that allows +/- 1 month from target.
create or replace view public.v_activity_schedule_targets_window as
with month_order(month_name, month_idx) as (
  values
    ('September', 1),
    ('October', 2),
    ('November', 3),
    ('December', 4),
    ('January', 5),
    ('February', 6),
    ('March', 7),
    ('April', 8),
    ('May', 9),
    ('June', 10),
    ('July', 11)
),
targets as (
  select
    t.id,
    t.book,
    t.activity_code,
    t.knack_id,
    t.canonical_name,
    t.target_month,
    t.tolerance_months,
    m.month_idx as target_month_idx
  from public.activity_schedule_targets t
  join month_order m
    on m.month_name = t.target_month
)
select
  t.id,
  t.book,
  t.activity_code,
  t.knack_id,
  t.canonical_name,
  t.target_month,
  t.tolerance_months,
  m.month_name as allowed_month
from targets t
join month_order m
  on least(
       abs(m.month_idx - t.target_month_idx),
       11 - abs(m.month_idx - t.target_month_idx)
     ) <= t.tolerance_months;

commit;
