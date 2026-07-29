-- Enum types get their own step. PostgreSQL refuses to let a value added to an
-- existing type be used before that transaction commits, and the next migration
-- both stores these types in columns and matches the new "products" import type
-- in an index predicate.
DO $enums$
DECLARE
  wanted record;
BEGIN
  FOR wanted IN
    SELECT *
    FROM (VALUES
      ('metaCatalogAuthMode', ARRAY['oauth', 'fbe']),
      ('metaCatalogConnectionStatus', ARRAY['active', 'invalid']),
      ('metaCatalogItemDirection', ARRAY['push', 'import']),
      ('metaCatalogSyncScope', ARRAY['all', 'category', 'selected']),
      ('metaCatalogSyncStatus', ARRAY['queued', 'running', 'succeeded', 'partial', 'failed']),
      ('metaCatalogImportStatus', ARRAY['idle', 'queued', 'running', 'succeeded', 'partial', 'failed'])
    ) AS t(name, labels)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = wanted.name) THEN
      EXECUTE format(
        'CREATE TYPE %I AS ENUM (%s)',
        wanted.name,
        (
          SELECT string_agg(quote_literal(label), ', ')
          FROM unnest(wanted.labels) AS label
        )
      );
    END IF;
  END LOOP;
END
$enums$;--> statement-breakpoint
ALTER TYPE "importType" ADD VALUE IF NOT EXISTS 'products';
