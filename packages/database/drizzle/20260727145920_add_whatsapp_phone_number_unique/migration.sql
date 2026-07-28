-- A Meta phone number can back exactly one integration platform-wide. The
-- application checked this before insert, but the check and the insert are
-- separated by network calls, so concurrent connects could slip through.
-- Fail with an actionable message instead of a bare index error when existing
-- data already violates the invariant.
DO $$
DECLARE
  duplicated text;
BEGIN
  SELECT string_agg(t."phoneNumberId", ', ')
  INTO duplicated
  FROM (
    SELECT "phoneNumberId"
    FROM "IntegrationWhatsapp"
    GROUP BY "phoneNumberId"
    HAVING count(*) > 1
  ) AS t;

  IF duplicated IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add IntegrationWhatsapp_phoneNumberId_key: phone number(s) % are connected more than once. Disconnect the duplicate integrations, then re-run migrations.',
      duplicated;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationWhatsapp_phoneNumberId_key" ON "IntegrationWhatsapp" ("phoneNumberId");
