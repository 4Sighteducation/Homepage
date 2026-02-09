-- Add optional exam_board field to study planner sessions
-- Used by Study Assistant to tailor guidance to spec/exam-board.

ALTER TABLE public.study_planner_plan_sessions
ADD COLUMN IF NOT EXISTS exam_board text;

CREATE INDEX IF NOT EXISTS study_planner_plan_sessions_exam_board_idx
  ON public.study_planner_plan_sessions (exam_board);

