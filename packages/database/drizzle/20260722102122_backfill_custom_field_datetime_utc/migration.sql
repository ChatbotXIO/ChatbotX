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
UPDATE "ContactCustomField" AS ccf
SET "value" = (
  to_char(cal.calendar_day, 'YYYY-MM-DD')
  || 'T00:00:00'
  || CASE WHEN off.offset_interval < INTERVAL '0' THEN '-' ELSE '+' END
  || to_char(
       make_interval(secs => abs(extract(epoch FROM off.offset_interval))::int),
       'HH24:MI'
     )
)
FROM "CustomField" AS cf, "Contact" AS c, "Workspace" AS w,
LATERAL (
  -- Same UTC fallback as the datetime pass: an unrecognized workspace timezone
  -- is treated as UTC rather than aborting the whole statement.
  SELECT CASE
    WHEN w."timezone" IN (SELECT name FROM pg_timezone_names) THEN w."timezone"
    ELSE 'UTC'
  END AS zone
) tz,
LATERAL (SELECT (left(ccf."value", 10))::date AS calendar_day) cal,
LATERAL (
  -- Offset of the workspace zone at that day's midnight = local wall-clock
  -- minus the UTC wall-clock of the same instant.
  SELECT (cal.calendar_day::timestamp)
       - ((cal.calendar_day::timestamp AT TIME ZONE tz.zone) AT TIME ZONE 'UTC')
    AS offset_interval
) off
WHERE ccf."customFieldId" = cf."id"
  AND c."id" = ccf."contactId"
  AND w."id" = c."workspaceId"
  AND cf."type" = 'date'
  AND ccf."value" ~ '^\d{4}-\d{2}-\d{2}'
  AND ccf."value" !~ '(Z|[+-]\d{2}:?\d{2})$'
  -- Skip legacy garbage that the ::date cast below would throw on.
  AND pg_input_is_valid(left(ccf."value", 10), 'date');
