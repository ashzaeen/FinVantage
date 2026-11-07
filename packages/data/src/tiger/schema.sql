-- Starting point for Tiger Data Postgres. Fields mirror packages/contracts.
-- Money is stored as integer cents, matching the contracts.

CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  display_name        TEXT NOT NULL,
  buffer_target_cents BIGINT NOT NULL,
  extension_settings  JSONB NOT NULL
);

CREATE TABLE income_profiles (
  user_id                     TEXT PRIMARY KEY REFERENCES users (id),
  monthly_income_cents        BIGINT NOT NULL,
  monthly_fixed_costs_cents   BIGINT NOT NULL,
  monthly_debt_payments_cents BIGINT NOT NULL,
  monthly_spending_cents      BIGINT NOT NULL,
  monthly_savings_cents       BIGINT NOT NULL,
  payday_day_of_month         INT NOT NULL
);

CREATE TABLE accounts (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users (id),
  type                  TEXT NOT NULL,
  loan_kind             TEXT,
  name                  TEXT NOT NULL,
  institution           TEXT NOT NULL,
  balance_cents         BIGINT NOT NULL,
  annual_rate           NUMERIC,
  minimum_payment_cents BIGINT,
  promo_rate_ends_on    DATE
);

CREATE TABLE transactions (
  id           TEXT NOT NULL,
  account_id   TEXT NOT NULL REFERENCES accounts (id),
  date         DATE NOT NULL,
  amount_cents BIGINT NOT NULL,
  merchant     TEXT NOT NULL,
  category     TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id, date)
);

CREATE TABLE goals (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users (id),
  name              TEXT NOT NULL,
  target_cents      BIGINT NOT NULL,
  current_cents     BIGINT NOT NULL,
  target_date       DATE NOT NULL,
  priority_rank     INT NOT NULL,
  flexibility       TEXT NOT NULL,
  linked_account_id TEXT REFERENCES accounts (id)
);

-- TODO(platform): make transactions a hypertable and add a continuous aggregate for the
-- time-bucketed spending summaries named in PRD section 3.1. Check Tiger Data's current docs.
