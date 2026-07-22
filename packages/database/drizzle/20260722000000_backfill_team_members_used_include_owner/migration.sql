-- Backfill `UserQuota.teamMembersUsed` to include the workspace owner's own
-- membership row, matching the corrected count in sync-user-quota.ts /
-- reconcileOwnerPoolUsage.
--
-- Aggregation mirrors that same reconcile logic: an active reseller's
-- `UserQuota` row IS the tenant pool, so it must be seeded from every
-- workspace under the tenant (`Workspace.tenantId`), not just workspaces the
-- reseller directly owns — a sub-account's own workspace carries the
-- reseller's `tenantId` but the sub-account's `ownerId`, and would otherwise
-- be missed. Non-pooled users (root tenant, or an owner without an active
-- tenant) are seeded from their own `Workspace.ownerId` count instead.
UPDATE "UserQuota" AS uq
SET "teamMembersUsed" = COALESCE(pooled.cnt, per_owner.cnt, 0),
    "syncedAt" = NOW(),
    "updatedAt" = CURRENT_TIMESTAMP
FROM (
  SELECT w."ownerId" AS owner_id, COUNT(wm.*) AS cnt
  FROM "WorkspaceMember" wm
  JOIN "Workspace" w ON wm."workspaceId" = w."id"
  GROUP BY w."ownerId"
) AS per_owner
FULL OUTER JOIN (
  SELECT t."ownerId" AS owner_id, COUNT(wm.*) AS cnt
  FROM "WorkspaceMember" wm
  JOIN "Workspace" w ON wm."workspaceId" = w."id"
  JOIN "Tenant" t ON w."tenantId" = t."id"
  WHERE t."ownerId" IS NOT NULL
    AND t."status" = 'active'
  GROUP BY t."ownerId"
) AS pooled ON pooled.owner_id = per_owner.owner_id
WHERE uq."userId" = COALESCE(pooled.owner_id, per_owner.owner_id);
