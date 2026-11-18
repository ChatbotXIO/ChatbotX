// @vitest-environment node

/**
 * `transferSubAccountWorkspaceToOwner` against a real Postgres: the move must
 * leave exactly one owner row (the reseller), drop the sub-account's members,
 * and re-stamp only the CURRENT-period `WorkspaceMac` row. The function opens
 * its own transaction, so this suite commits fixture rows and removes them in
 * `afterAll`.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/business test:db`.
 */

import { db, eq, inArray } from "@chatbotx.io/database/client"
import {
  ROOT_TENANT_ID,
  tenantModel,
  userModel,
  workspaceMacModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"

/** The shared Vitest preset uses a non-routable port so DB suites self-skip. */
const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

const hasDatabase = realDatabaseUrl() !== null

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  invalidateCacheByTags: vi.fn(async () => undefined),
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
}))
vi.mock("../../src/audit/dispatcher", () => ({
  dispatchAuditRecordSafely: vi.fn(async () => undefined),
}))
vi.mock("../../src/user-quota/service", () => ({
  userQuotaService: {
    reconcileUserSelfUsage: vi.fn(async () => undefined),
    reconcileOwnerPoolUsage: vi.fn(async () => undefined),
  },
}))
vi.mock("../../src/platform/realtime-broadcast", () => ({
  tryRevokeWorkspaceMemberRealtimeConnections: vi.fn(async () => true),
}))
vi.mock("../../src/workspace-usage/service", () => ({
  workspaceUsageService: {
    increment: vi.fn(async () => true),
    decrement: vi.fn(async () => undefined),
  },
}))

const DAY_MS = 24 * 60 * 60 * 1000

describe.skipIf(!hasDatabase)("transferSubAccountWorkspaceToOwner (db)", () => {
  const ids = {
    reseller: createId(),
    subOwner: createId(),
    subAgent: createId(),
    tenant: createId(),
    workspace: createId(),
    currentMac: createId(),
    pastMac: createId(),
  }

  beforeAll(async () => {
    await db.insert(userModel).values({
      id: ids.reseller,
      email: `transfer-reseller-${ids.reseller}@example.test`,
      name: "Transfer reseller",
    })
    await db
      .insert(tenantModel)
      .values({ id: ids.tenant, ownerId: ids.reseller, status: "active" })
    await db.insert(userModel).values([
      {
        id: ids.subOwner,
        email: `transfer-sub-owner-${ids.subOwner}@example.test`,
        name: "Sub owner",
        tenantId: ids.tenant,
      },
      {
        id: ids.subAgent,
        email: `transfer-sub-agent-${ids.subAgent}@example.test`,
        name: "Sub agent",
        tenantId: ids.tenant,
      },
    ])
    await db.insert(workspaceModel).values({
      id: ids.workspace,
      ownerId: ids.subOwner,
      tenantId: ids.tenant,
      name: "Transfer test workspace",
    })
    await db.insert(workspaceMemberModel).values([
      {
        id: createId(),
        workspaceId: ids.workspace,
        userId: ids.subOwner,
        role: "owner",
      },
      {
        id: createId(),
        workspaceId: ids.workspace,
        userId: ids.subAgent,
        role: "agent",
      },
    ])
    const now = Date.now()
    await db.insert(workspaceMacModel).values([
      {
        id: ids.currentMac,
        workspaceId: ids.workspace,
        ownerId: ids.subOwner,
        tenantId: ids.tenant,
        periodStart: new Date(now - DAY_MS),
        periodEnd: new Date(now + 29 * DAY_MS),
      },
      {
        id: ids.pastMac,
        workspaceId: ids.workspace,
        ownerId: ids.subOwner,
        tenantId: ids.tenant,
        periodStart: new Date(now - 60 * DAY_MS),
        periodEnd: new Date(now - 30 * DAY_MS),
      },
    ])
  })

  afterAll(async () => {
    if (!hasDatabase) {
      return
    }
    await db
      .delete(workspaceMacModel)
      .where(inArray(workspaceMacModel.id, [ids.currentMac, ids.pastMac]))
    await db.delete(workspaceModel).where(eq(workspaceModel.id, ids.workspace))
    await db
      .delete(userModel)
      .where(inArray(userModel.id, [ids.subOwner, ids.subAgent]))
    await db.delete(tenantModel).where(eq(tenantModel.id, ids.tenant))
    await db.delete(userModel).where(eq(userModel.id, ids.reseller))
  })

  test("leaves one owner row and restamps only the current-period MAC row", async () => {
    const { transferSubAccountWorkspaceToOwner } = await import(
      "../../src/workspace/transfer-to-reseller-owner"
    )

    const result = await transferSubAccountWorkspaceToOwner({
      resellerUserId: ids.reseller,
      workspaceId: ids.workspace,
      actorUserId: ids.reseller,
    })

    expect(result.previousOwnerId).toBe(ids.subOwner)
    expect([...result.removedUserIds].sort()).toEqual(
      [ids.subOwner, ids.subAgent].sort(),
    )

    const [workspace] = await db
      .select({
        ownerId: workspaceModel.ownerId,
        tenantId: workspaceModel.tenantId,
      })
      .from(workspaceModel)
      .where(eq(workspaceModel.id, ids.workspace))
    expect(workspace).toEqual({
      ownerId: ids.reseller,
      tenantId: ROOT_TENANT_ID,
    })

    const members = await db
      .select({
        userId: workspaceMemberModel.userId,
        role: workspaceMemberModel.role,
      })
      .from(workspaceMemberModel)
      .where(eq(workspaceMemberModel.workspaceId, ids.workspace))
    expect(members).toEqual([{ userId: ids.reseller, role: "owner" }])

    const macs = await db
      .select({
        id: workspaceMacModel.id,
        ownerId: workspaceMacModel.ownerId,
        tenantId: workspaceMacModel.tenantId,
      })
      .from(workspaceMacModel)
      .where(eq(workspaceMacModel.workspaceId, ids.workspace))
    const byId = new Map(macs.map((mac) => [mac.id, mac]))
    expect(byId.get(ids.currentMac)).toMatchObject({
      ownerId: ids.reseller,
      tenantId: ROOT_TENANT_ID,
    })
    expect(byId.get(ids.pastMac)).toMatchObject({
      ownerId: ids.subOwner,
      tenantId: ids.tenant,
    })
  })
})
