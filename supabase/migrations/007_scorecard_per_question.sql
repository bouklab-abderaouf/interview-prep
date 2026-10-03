-- Per-question breakdown on the scorecard: one {question, bank_index, score,
-- verdict} entry per substantive question the interviewer asked. Defaulted
-- to an empty array so scorecards written before this existed still read
-- as "no breakdown" rather than null.
alter table scorecards
  add column if not exists per_question jsonb not null default '[]';
