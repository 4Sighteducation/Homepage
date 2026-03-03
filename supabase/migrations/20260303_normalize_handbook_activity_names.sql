-- Normalize VESPA Handbook activity names (typo/snagging pass).
-- This migration updates canonical names in:
--   - public.activities (primary source used by scene_1294 assets)
--   - public.activity_kb (planner library lookup table)
--
-- Requested canonical names:
--   Proactive vs Reactive
--   Becoming Indistractable
--   The Peloton
--   Check Ahead, Check Back
--   Test Your Future Self
--   Red Flags and Rescue Plans
--   Boosters and Sappers (Energy Makes Time)

begin;

-- ------------------------------------------------------------
-- 1) public.activities (book-scoped + legacy/fallback rows)
-- ------------------------------------------------------------
update public.activities
set name = 'Proactive vs Reactive',
    updated_at = now()
where activity_code = 'EF1'
  and (
    coalesce(book, '') = 'VESPA Handbook'
    or month is null
    or name in ('Proactive vs Re-Active', 'Proactive vs Reactive')
  );

update public.activities
set name = 'Becoming Indistractable',
    updated_at = now()
where activity_code = 'EF10'
  and (
    coalesce(book, '') = 'VESPA Handbook'
    or month is null
    or name in ('Becoming Indestractable', 'Indisctractible', 'Indistractible')
  );

update public.activities
set name = 'The Peloton',
    updated_at = now()
where activity_code = 'EF9'
  and (
    coalesce(book, '') = 'VESPA Handbook'
    or month is null
    or name in ('The Peleton', 'Peloton')
  );

update public.activities
set name = 'Check Ahead, Check Back',
    updated_at = now()
where activity_code = 'AT16'
  and (
    coalesce(book, '') = 'VESPA Handbook'
    or month is null
    or name in ('Check ahead, Check Back', 'Check Ahead, Check Back')
  );

update public.activities
set name = 'Test Your Future Self',
    updated_at = now()
where activity_code = 'PR33'
  and (
    coalesce(book, '') = 'VESPA Handbook'
    or month is null
    or name in ('Test your Future Self', 'Test Your Future Self')
  );

update public.activities
set name = 'Red Flags and Rescue Plans',
    updated_at = now()
where activity_code = 'EF32'
  and (
    coalesce(book, '') = 'VESPA Handbook'
    or month is null
    or name in ('Red Flag Rescue Plans', 'Red Flag Rescue')
  );

update public.activities
set name = 'Boosters and Sappers (Energy Makes Time)',
    updated_at = now()
where activity_code = 'SY41'
  and (
    coalesce(book, '') = 'VESPA Handbook'
    or month is null
    or name in ('Boosters & Sappers (energy Makes Time)', 'Boosters vs Sappers')
  );

-- ------------------------------------------------------------
-- 2) public.activity_kb (if codes exist there, keep aligned)
-- ------------------------------------------------------------
update public.activity_kb
set name = 'Proactive vs Reactive',
    updated_at = now()
where activity_code = 'EF1';

update public.activity_kb
set name = 'Becoming Indistractable',
    updated_at = now()
where activity_code = 'EF10';

update public.activity_kb
set name = 'The Peloton',
    updated_at = now()
where activity_code = 'EF9';

update public.activity_kb
set name = 'Check Ahead, Check Back',
    updated_at = now()
where activity_code = 'AT16';

update public.activity_kb
set name = 'Test Your Future Self',
    updated_at = now()
where activity_code = 'PR33';

update public.activity_kb
set name = 'Red Flags and Rescue Plans',
    updated_at = now()
where activity_code = 'EF32';

update public.activity_kb
set name = 'Boosters and Sappers (Energy Makes Time)',
    updated_at = now()
where activity_code = 'SY41';

-- ------------------------------------------------------------
-- 3) Validation query
-- ------------------------------------------------------------
select activity_code, name, book, month
from public.activities
where activity_code in ('EF1', 'EF10', 'EF9', 'AT16', 'PR33', 'EF32', 'SY41')
order by activity_code, month nulls last, book nulls last, name;

commit;
