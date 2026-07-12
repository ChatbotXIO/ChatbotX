WITH "timezoneOffsets"("offsetKey", "zone") AS (
  VALUES
    ('-12', 'Etc/GMT+12'),
    ('-11', 'Pacific/Pago_Pago'),
    ('-10', 'Pacific/Honolulu'),
    ('-9', 'America/Anchorage'),
    ('-8', 'America/Los_Angeles'),
    ('-7', 'America/Denver'),
    ('-6', 'America/Chicago'),
    ('-5', 'America/New_York'),
    ('-4', 'America/Halifax'),
    ('-3', 'America/Sao_Paulo'),
    ('-2', 'Atlantic/South_Georgia'),
    ('-1', 'Atlantic/Azores'),
    ('0', 'UTC'),
    ('1', 'Europe/Berlin'),
    ('2', 'Europe/Athens'),
    ('3', 'Europe/Moscow'),
    ('4', 'Asia/Dubai'),
    ('5', 'Asia/Karachi'),
    ('6', 'Asia/Dhaka'),
    ('7', 'Asia/Bangkok'),
    ('8', 'Asia/Singapore'),
    ('9', 'Asia/Tokyo'),
    ('10', 'Australia/Sydney'),
    ('11', 'Pacific/Noumea'),
    ('12', 'Pacific/Auckland'),
    ('13', 'Pacific/Tongatapu'),
    ('14', 'Pacific/Kiritimati')
),
"parsedContactTimezones" AS (
  SELECT
    "Contact"."id",
    CASE
      WHEN COALESCE("matched"."parts"[3], '0')::integer = 0 THEN
        ((CASE WHEN "matched"."parts"[1] = '-' THEN -1 ELSE 1 END) * "matched"."parts"[2]::integer)::text
      ELSE
        ((CASE WHEN "matched"."parts"[1] = '-' THEN -1 ELSE 1 END) * ("matched"."parts"[2]::numeric + "matched"."parts"[3]::numeric / 60))::text
    END AS "offsetKey"
  FROM "Contact"
  CROSS JOIN LATERAL regexp_match(
    btrim("Contact"."timezone"),
    '^([+-]?)(\d{1,2})(?::?([0-5]\d))?$'
  ) AS "matched"("parts")
  WHERE "Contact"."timezone" IS NOT NULL
)
UPDATE "Contact"
SET "timezone" = "timezoneOffsets"."zone"
FROM "parsedContactTimezones"
INNER JOIN "timezoneOffsets" ON "timezoneOffsets"."offsetKey" = "parsedContactTimezones"."offsetKey"
WHERE "Contact"."id" = "parsedContactTimezones"."id"
  AND "Contact"."timezone" IS DISTINCT FROM "timezoneOffsets"."zone";
