-- Data-only migration: no schema/DDL change. `WorkspaceApiToken.scopes` is a
-- plain `text[]` (see `packages/database/src/partials/workspace-api-token.ts`),
-- not a pg enum, so this only rewrites already-issued tokens' scope values.
--
-- The `WorkspaceApiTokenScope` enum values "channels" and "integrations" were
-- merged into a single "connections" value — every route that used either
-- scope now requires "connections" instead. This maps both old values to the
-- new one, de-duplicating in case a token already carried both (or already
-- carries "connections" for some other reason). Rows with `scopes IS NULL`
-- (the "All scopes" / unrestricted sentinel) are untouched — the `WHERE`
-- clause only matches rows whose array actually contains one of the old
-- values.
UPDATE "WorkspaceApiToken"
SET "scopes" = (
  SELECT array_agg(DISTINCT CASE WHEN s IN ('channels', 'integrations') THEN 'connections' ELSE s END)
  FROM unnest("scopes") AS s
)
WHERE "scopes" && ARRAY['channels', 'integrations'];
