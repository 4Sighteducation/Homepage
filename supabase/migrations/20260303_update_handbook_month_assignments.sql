-- Update VESPA Handbook suggested month assignments to the new planner.
-- Source requested by stakeholder on 2026-03-03.
--
-- Notes:
-- 1) This updates `activities.month` and also mirrors month/book into `activities.content`.
-- 2) Matching is done by `knack_id` because one target row ("6 Types of Goal") has no activity_code.
-- 3) "O.D.A" currently appears in DB as code AT12 with name "K-SPA"; this migration re-dates that row.

begin;

with target_schedule (knack_id, target_month) as (
  values
    -- September (4)
    ('66e31b4b81c24402cfe24c29', 'September'), -- 6 Types of Goal
    ('66c37906db0d0602d3cd07e9', 'September'), -- Another 20 Questions
    ('66cb9078ae5c8a02d616501a', 'September'), -- Becoming Indestractable
    ('66cb9078ae5c8a02d6165036', 'September'), -- Clarity Countdown

    -- October (4)
    ('66cb9078ae5c8a02d616500c', 'October'),   -- Proactive vs Re-Active
    ('66cb9078ae5c8a02d6165044', 'October'),   -- Sunday Night Ritual
    ('66cb9078ae5c8a02d61650b4', 'October'),   -- NAF vs NAch
    ('66cb9078ae5c8a02d6165075', 'October'),   -- 1% Planning

    -- November (4)
    ('66cb9078ae5c8a02d61650c9', 'November'),  -- 5,5,5
    ('66cb9078ae5c8a02d6165021', 'November'),  -- Disruption Cost and Deep Work
    ('66cb9078ae5c8a02d6165060', 'November'),  -- Catch-Up Week
    ('66cb9078ae5c8a02d6165098', 'November'),  -- Cog P vs Cog A

    -- December (4)
    ('66cb9078ae5c8a02d616503d', 'December'),  -- Red Flag Rescue Plans
    ('66cb9078ae5c8a02d6165059', 'December'),  -- Boosters & Sappers
    ('66cb9078ae5c8a02d61650bb', 'December'),  -- Check Ahead, Check Back
    ('66cb9078ae5c8a02d61650de', 'December'),  -- Myth of the Curve

    -- January (4)
    ('66c37906db0d0602d3cd080a', 'January'),   -- A Question of Money
    ('66c37906db0d0602d3cd07ff', 'January'),   -- Ikigai
    ('66cb9078ae5c8a02d616504b', 'January'),   -- Night School
    ('66cb9078ae5c8a02d6165067', 'January'),   -- Have to, Ought to, Want to

    -- February (4)
    ('66c37906db0d0602d3cd0815', 'February'),  -- Outcome Control
    ('66c37906db0d0602d3cd0820', 'February'),  -- The Paths are Well Lit
    ('66cb9078ae5c8a02d6165028', 'February'),  -- Questify
    ('66cb9078ae5c8a02d616507c', 'February'),  -- High & Low Utility

    -- March (5)
    ('66cb9078ae5c8a02d6165013', 'March'),     -- The Peleton
    ('66cb9078ae5c8a02d616506e', 'March'),     -- Cornell Notes
    ('66cb9078ae5c8a02d6165083', 'March'),     -- Closed Book Notetaking
    ('66cb9078ae5c8a02d616508a', 'March'),     -- Verbal Recaps
    ('66cb9078ae5c8a02d61650d7', 'March'),     -- Think Three Positives

    -- April (4)
    ('66cb9078ae5c8a02d616502f', 'April'),     -- Activating and Sustaining
    ('66cb9078ae5c8a02d6165091', 'April'),     -- Test your Future Self
    ('66cb9078ae5c8a02d61650ad', 'April'),     -- Sticky Timetables
    ('66cb9078ae5c8a02d61650d0', 'April'),     -- O.D.A (coded as AT12 row)

    -- May (2)
    ('66cb9078ae5c8a02d616509f', 'May'),       -- The Command Verb Table
    ('66cb9078ae5c8a02d61650a6', 'May'),       -- The Overnight Boost

    -- June (2)
    ('66c37906db0d0602d3cd07f4', 'June'),      -- Sweet & Sour Summers
    ('66cb9078ae5c8a02d61650e5', 'June')       -- Worst Case Scenarios
)
update public.activities a
set
  month = t.target_month,
  book = 'VESPA Handbook',
  content = jsonb_set(
    jsonb_set(coalesce(a.content, '{}'::jsonb), '{month}', to_jsonb(t.target_month), true),
    '{book}',
    to_jsonb('VESPA Handbook'::text),
    true
  ),
  updated_at = now()
from target_schedule t
where a.knack_id = t.knack_id;

-- Validation query (safe to keep in migration for audit logs).
-- It will show the rows just updated and their final month values.
select
  a.knack_id,
  a.activity_code,
  a.name,
  a.book,
  a.month,
  a.content ->> 'month' as content_month
from public.activities a
where a.knack_id in (
  select knack_id
  from (
    values
      ('66e31b4b81c24402cfe24c29'),
      ('66c37906db0d0602d3cd07e9'),
      ('66cb9078ae5c8a02d616501a'),
      ('66cb9078ae5c8a02d6165036'),
      ('66cb9078ae5c8a02d616500c'),
      ('66cb9078ae5c8a02d6165044'),
      ('66cb9078ae5c8a02d61650b4'),
      ('66cb9078ae5c8a02d6165075'),
      ('66cb9078ae5c8a02d61650c9'),
      ('66cb9078ae5c8a02d6165021'),
      ('66cb9078ae5c8a02d6165060'),
      ('66cb9078ae5c8a02d6165098'),
      ('66cb9078ae5c8a02d616503d'),
      ('66cb9078ae5c8a02d6165059'),
      ('66cb9078ae5c8a02d61650bb'),
      ('66cb9078ae5c8a02d61650de'),
      ('66c37906db0d0602d3cd080a'),
      ('66c37906db0d0602d3cd07ff'),
      ('66cb9078ae5c8a02d616504b'),
      ('66cb9078ae5c8a02d6165067'),
      ('66c37906db0d0602d3cd0815'),
      ('66c37906db0d0602d3cd0820'),
      ('66cb9078ae5c8a02d6165028'),
      ('66cb9078ae5c8a02d616507c'),
      ('66cb9078ae5c8a02d6165013'),
      ('66cb9078ae5c8a02d616506e'),
      ('66cb9078ae5c8a02d6165083'),
      ('66cb9078ae5c8a02d616508a'),
      ('66cb9078ae5c8a02d61650d7'),
      ('66cb9078ae5c8a02d616502f'),
      ('66cb9078ae5c8a02d6165091'),
      ('66cb9078ae5c8a02d61650ad'),
      ('66cb9078ae5c8a02d61650d0'),
      ('66cb9078ae5c8a02d616509f'),
      ('66cb9078ae5c8a02d61650a6'),
      ('66c37906db0d0602d3cd07f4'),
      ('66cb9078ae5c8a02d61650e5')
  ) ids(knack_id)
)
order by
  case a.month
    when 'September' then 1
    when 'October' then 2
    when 'November' then 3
    when 'December' then 4
    when 'January' then 5
    when 'February' then 6
    when 'March' then 7
    when 'April' then 8
    when 'May' then 9
    when 'June' then 10
    when 'July' then 11
    else 99
  end,
  a.name;

commit;
