ALTER TABLE "ContactInbox" ADD COLUMN "personaId" text;--> statement-breakpoint
-- Backfill a stable local id for personas saved before personas carried one, so
-- the "Set Persona" flow action and ContactInbox.personaId can reference them.
-- The id is generated as a numeric (bigint-style) string to match the
-- application's createId() format used everywhere else; it is an opaque, stable
-- key. clock_timestamp() advances per call and the * 1000 + ordinality offset
-- guarantees uniqueness across personas within and across rows.
UPDATE "IntegrationMessenger" AS im
SET "personas" = sub.personas
FROM (
  SELECT
    im2.id AS im_id,
    jsonb_agg(
      CASE
        WHEN (elem.value ? 'id') AND (elem.value->>'id') <> '' THEN elem.value
        ELSE elem.value || jsonb_build_object(
          'id',
          (
            (floor(extract(epoch FROM clock_timestamp()) * 1000))::bigint * 1000
            + elem.ordinality
          )::text
        )
      END
      ORDER BY elem.ordinality
    ) AS personas
  FROM "IntegrationMessenger" AS im2,
       LATERAL jsonb_array_elements(im2."personas")
         WITH ORDINALITY AS elem(value, ordinality)
  WHERE jsonb_typeof(im2."personas") = 'array'
    AND jsonb_array_length(im2."personas") > 0
  GROUP BY im2.id
) AS sub
WHERE im.id = sub.im_id
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(im."personas") AS e
    WHERE NOT (e ? 'id') OR (e->>'id') = ''
  );
