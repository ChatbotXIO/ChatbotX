// @vitest-environment node

/**
 * `publishDestinationRepository.recordRecheckedScopes` against a real database:
 * the compare-and-swap on `checkedAt` and the inbox token fingerprint, the
 * conditional clearing of a recorded `permissionMissing`, and workspace scoping.
 *
 * Runs only against an explicitly configured local database:
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import { publishDestinationRepository } from "../../src/repositories/publish-destination"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const fingerprint = (token: string) =>
  createHash("sha256").update(token).digest("hex")
const REQUIRED = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
]

describe.skipIf(!databaseUrl)("recordRecheckedScopes (real database)", () => {
  let client: Client
  let userId: string
  let workspaceId: string
  let otherWorkspaceId: string
  let sequence = 0
  const nextId = () => `${Date.now()}${String(++sequence).padStart(6, "0")}`
  const database = () => drizzle({ client, relations, schema })

  type Seed = {
    checkedAt: Date | null
    id: string
    status?: "ok" | "permissionMissing"
    statusFingerprint?: string | null
    token: string
  }

  const seed = async (input: {
    granted?: string[] | null
    missing?: string[]
    status?: "ok" | "permissionMissing"
    statusToken?: string
    token: string
  }): Promise<Seed> => {
    const db = database()
    const [inbox] = await db
      .insert(schema.inboxModel)
      .values({
        channel: "messenger",
        name: `recheck-${nextId()}`,
        sourceId: nextId(),
        status: "connected",
        workspaceId,
      })
      .returning({ id: schema.inboxModel.id })
    await db.insert(schema.integrationMessengerModel).values({
      auth: { tokens: { accessToken: input.token } },
      conversationStarters: [],
      inboxId: inbox.id,
      name: "page",
      pageId: `page-${nextId()}`,
      persistentMenus: [],
      personas: [],
      workspaceId,
    })
    const [binding] = await publishDestinationRepository.ensureForInboxes(
      { inboxIds: [inbox.id], workspaceId },
      db as never,
    )
    const checkedAt = new Date("2026-11-25T09:00:00.000Z")
    await db
      .update(schema.publishDestinationModel)
      .set({
        checkedAt,
        grantedScopes: input.granted ?? null,
        missingScopes: input.missing ?? [],
        publishStatus: input.status ?? "ok",
        statusTokenFingerprint: input.statusToken
          ? fingerprint(input.statusToken)
          : null,
      })
      .where(eq(schema.publishDestinationModel.id, binding.id))
    return { checkedAt, id: binding.id, token: input.token }
  }

  const readRow = async (id: string) => {
    const [row] = await database()
      .select({
        checkedAt: schema.publishDestinationModel.checkedAt,
        grantedScopes: schema.publishDestinationModel.grantedScopes,
        missingScopes: schema.publishDestinationModel.missingScopes,
        publishStatus: schema.publishDestinationModel.publishStatus,
        statusTokenFingerprint:
          schema.publishDestinationModel.statusTokenFingerprint,
      })
      .from(schema.publishDestinationModel)
      .where(eq(schema.publishDestinationModel.id, id))
    return row
  }

  const recheck = (
    destination: Seed,
    overrides: Partial<{
      expectedCheckedAt: Date | null
      grantedScopes: string[]
      missingScopes: string[]
      token: string
      workspaceId: string
    }> = {},
  ) => {
    const grantedScopes = overrides.grantedScopes ?? REQUIRED
    return publishDestinationRepository.recordRecheckedScopes(
      {
        expectedCheckedAt:
          overrides.expectedCheckedAt === undefined
            ? destination.checkedAt
            : overrides.expectedCheckedAt,
        grantedScopes,
        id: destination.id,
        missingScopes:
          overrides.missingScopes ??
          REQUIRED.filter((scope) => !grantedScopes.includes(scope)),
        now: new Date("2026-11-25T10:00:00.000Z"),
        provider: "facebook",
        tokenFingerprint: fingerprint(overrides.token ?? destination.token),
        workspaceId: overrides.workspaceId ?? workspaceId,
      },
      database() as never,
    )
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
    const db = database()
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `recheck-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const workspaces = await db
      .insert(schema.workspaceModel)
      .values([
        { name: `recheck-${suffix}`, ownerId: user.id },
        { name: `recheck-other-${suffix}`, ownerId: user.id },
      ])
      .returning({ id: schema.workspaceModel.id })
    userId = user.id
    workspaceId = workspaces[0].id
    otherWorkspaceId = workspaces[1].id
  })

  afterAll(async () => {
    await client.query(`DELETE FROM "Workspace" WHERE "ownerId" = $1`, [userId])
    await client.query(`DELETE FROM "User" WHERE id = $1`, [userId])
    await client.end()
  })

  test("writes the scopes when the token and checkedAt are unchanged", async () => {
    const destination = await seed({ granted: null, token: "tok-a" })

    expect(
      await recheck(destination, { grantedScopes: ["pages_show_list"] }),
    ).toBe(true)

    const row = await readRow(destination.id)
    expect(row.grantedScopes).toEqual(["pages_show_list"])
    expect(row.missingScopes).toEqual([
      "pages_manage_posts",
      "pages_read_engagement",
    ])
    expect(row.publishStatus).toBe("ok")
    expect(row.checkedAt?.toISOString()).toBe("2026-11-25T10:00:00.000Z")
  })

  test("a checkedAt moved meanwhile (reconnect or another re-check) wins: no write", async () => {
    const destination = await seed({ granted: ["old"], token: "tok-b" })
    const moved = new Date("2026-11-25T09:30:00.000Z")
    await database()
      .update(schema.publishDestinationModel)
      .set({ checkedAt: moved })
      .where(eq(schema.publishDestinationModel.id, destination.id))

    expect(await recheck(destination)).toBe(false)

    const row = await readRow(destination.id)
    expect(row.grantedScopes).toEqual(["old"])
    expect(row.checkedAt?.toISOString()).toBe(moved.toISOString())
  })

  test("a null checkedAt is compared as null", async () => {
    const destination = await seed({ granted: null, token: "tok-n" })
    await database()
      .update(schema.publishDestinationModel)
      .set({ checkedAt: null })
      .where(eq(schema.publishDestinationModel.id, destination.id))

    expect(await recheck(destination, { expectedCheckedAt: null })).toBe(true)
    expect(await recheck(destination, { expectedCheckedAt: null })).toBe(false)
  })

  test("a replaced inbox token (different fingerprint) is not written", async () => {
    const destination = await seed({ granted: ["old"], token: "tok-c" })

    expect(await recheck(destination, { token: "tok-stale" })).toBe(false)

    expect((await readRow(destination.id)).grantedScopes).toEqual(["old"])
  })

  test("permissionMissing is cleared only for the same token with no scope missing", async () => {
    const destination = await seed({
      missing: ["pages_manage_posts"],
      status: "permissionMissing",
      statusToken: "tok-d",
      token: "tok-d",
    })

    expect(await recheck(destination)).toBe(true)

    const row = await readRow(destination.id)
    expect(row.publishStatus).toBe("ok")
    expect(row.statusTokenFingerprint).toBeNull()
    expect(row.missingScopes).toEqual([])
  })

  test("permissionMissing stays, with its missing list, while a scope is still missing", async () => {
    const destination = await seed({
      missing: ["pages_manage_posts"],
      status: "permissionMissing",
      statusToken: "tok-e",
      token: "tok-e",
    })

    expect(
      await recheck(destination, {
        grantedScopes: ["pages_read_engagement", "pages_show_list"],
      }),
    ).toBe(true)

    const row = await readRow(destination.id)
    expect(row.publishStatus).toBe("permissionMissing")
    expect(row.statusTokenFingerprint).toBe(fingerprint("tok-e"))
    expect(row.missingScopes).toEqual(["pages_manage_posts"])
    expect(row.grantedScopes).toEqual([
      "pages_read_engagement",
      "pages_show_list",
    ])
  })

  test("permissionMissing recorded for another token is kept even when nothing is missing", async () => {
    const destination = await seed({
      missing: ["pages_manage_posts"],
      status: "permissionMissing",
      statusToken: "older-token",
      token: "tok-f",
    })

    expect(await recheck(destination)).toBe(true)

    const row = await readRow(destination.id)
    expect(row.publishStatus).toBe("permissionMissing")
    expect(row.statusTokenFingerprint).toBe(fingerprint("older-token"))
    expect(row.missingScopes).toEqual(["pages_manage_posts"])
  })

  test("another workspace cannot write the destination", async () => {
    const destination = await seed({ granted: ["old"], token: "tok-g" })

    expect(await recheck(destination, { workspaceId: otherWorkspaceId })).toBe(
      false,
    )

    expect((await readRow(destination.id)).grantedScopes).toEqual(["old"])
  })
})
