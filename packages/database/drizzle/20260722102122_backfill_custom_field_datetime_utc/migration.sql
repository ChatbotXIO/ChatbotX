-- Reinterpret legacy naive datetime custom-field values as UTC, using each
-- contact's workspace timezone. Idempotent: values already carrying Z/offset
-- are skipped.
UPDATE "ContactCustomField" AS ccf
SET "value" = to_char(
  ((ccf."value")::timestamp AT TIME ZONE (
    -- An unrecognized/legacy workspace timezone (not a valid IANA name) falls
    -- back to UTC — the naive value is treated as already-UTC — so one bad
    -- workspace can never abort the whole backfill.
    CASE
      WHEN w."timezone" IN (SELECT name FROM pg_timezone_names) THEN w."timezone"
      ELSE 'UTC'
    END
  )) AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
)
FROM "CustomField" AS cf, "Contact" AS c, "Workspace" AS w
WHERE ccf."customFieldId" = cf."id"
  AND c."id" = ccf."contactId"
  AND w."id" = c."workspaceId"
  AND cf."type" = 'datetime'
  AND ccf."value" ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}'
  AND ccf."value" !~ '(Z|[+-]\d{2}:?\d{2})$'
  -- Skip legacy garbage (e.g. "2026-02-30 …") that the ::timestamp cast below
  -- would throw on and abort the whole statement.
  AND pg_input_is_valid(ccf."value", 'timestamp');
--> statement-breakpoint
-- Reinterpret legacy naive date values as the offset-preserved start-of-day in
-- the workspace zone (e.g. "2026-07-22" in UTC+7 -> "2026-07-22T00:00:00+07:00").
-- The calendar day is kept verbatim; only an explicit offset is added so the
-- stored instant is correct while the date part stays zone-independent.
-- Idempotent: rows already carrying Z/offset are skipped.
--
-- The day and its zone offset are resolved in a derived table rather than in
-- LATERAL items of the UPDATE's own FROM list: an UPDATE target is not a
-- FROM-clause entry, so LATERAL siblings may not reference it (SQLSTATE 42P10).
-- Inside the derived table "ContactCustomField" is an ordinary relation, so the
-- same chain composes; the rows are joined back by primary key.
UPDATE "ContactCustomField" AS ccf
SET "value" = (
  to_char(zoned_day.calendar_day, 'YYYY-MM-DD')
  || 'T00:00:00'
  || CASE
       -- date-fns' `XXX` (the pattern the app writes with) renders a zero offset
       -- as `Z`, not `+00:00`. Match it so a backfilled row in a UTC workspace is
       -- byte-identical to one the app would have written.
       WHEN zoned_day.offset_interval = INTERVAL '0' THEN 'Z'
       ELSE
         CASE WHEN zoned_day.offset_interval < INTERVAL '0' THEN '-' ELSE '+' END
         || to_char(
              make_interval(secs => abs(extract(epoch FROM zoned_day.offset_interval))::int),
              'HH24:MI'
            )
     END
)
FROM (
  SELECT
    resolved_day."id",
    resolved_day.calendar_day,
    -- Offset of the workspace zone at that day's midnight = local wall-clock
    -- minus the UTC wall-clock of the same instant.
    (resolved_day.calendar_day::timestamp)
      - ((resolved_day.calendar_day::timestamp AT TIME ZONE resolved_day.zone)
         AT TIME ZONE 'UTC') AS offset_interval
  FROM (
    SELECT
      target."id",
      -- Safe to cast here: this is a projection, evaluated only for rows that
      -- already passed the pg_input_is_valid guard below.
      (left(target."value", 10))::date AS calendar_day,
      -- Same UTC fallback as the datetime pass: an unrecognized workspace
      -- timezone is treated as UTC rather than aborting the whole statement.
      CASE
        WHEN w."timezone" IN (SELECT name FROM pg_timezone_names) THEN w."timezone"
        ELSE 'UTC'
      END AS zone
    FROM "ContactCustomField" AS target
    JOIN "CustomField" AS cf ON cf."id" = target."customFieldId"
    JOIN "Contact" AS c ON c."id" = target."contactId"
    JOIN "Workspace" AS w ON w."id" = c."workspaceId"
    WHERE cf."type" = 'date'
      AND target."value" ~ '^\d{4}-\d{2}-\d{2}'
      AND target."value" !~ '(Z|[+-]\d{2}:?\d{2})$'
      -- Skip legacy garbage that the ::date cast above would throw on.
      AND pg_input_is_valid(left(target."value", 10), 'date')
  ) AS resolved_day
) AS zoned_day
WHERE ccf."id" = zoned_day."id";
