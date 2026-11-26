// @vitest-environment node

/**
 * The social account tables against a real database: the unique keys, the
 * reconnect that keeps a row's id, the destination merge, the token wipe on
 * disconnect, the cascade, and the refresh scanner's claim (two workers never
 * take the same row).
 *
 * Runs only against an explicitly configured local database after the approved
 * migrations were applied: `pnpm --filter @chatbotx.io/database test:db`.
 */

import type { EncryptedData } from "@chatbotx.io/encryption"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import { socialAccountRepository } from "../../src/repositories/social-account/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const DAY = 24 * 60 * 60 * 1000
const blob = (label: string) => ({ label }) as unknown as EncryptedData

type Fixture = { otherWorkspaceId: string; userId: string; workspaceId: string }

describe.skipIf(!databaseUrl)("social accounts against a real database", () => {
  let client: Client
  let fixture: Fixture
  let sequence = 0
  const nextId = () => `${Date.now()}${String(++sequence).padStart(6, "0")}`

  const identity = (
    overrides: Partial<
      Parameters<typeof socialAccountRepository.upsertIdentity>[0]
    > = {},
  ) => ({
    avatar: null,
    connectedById: fixture.userId,
    displayName: "Shop",
    externalAccountId: `ext-${nextId()}`,
    grantedScopes: ["a"],
    id: nextId(),
    provider: "tiktok" as const,
    statusReason: null,
    tokenExpiresAt: null,
    username: null,
    workspaceId: fixture.workspaceId,
    ...overrides,
  })

  const row = async (id: string) =>
    (await client.query(`SELECT * FROM "SocialAccount" WHERE id = $1`, [id]))
      .rows[0]

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
    const database = drizzle({ client, relations, schema })
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await database
      .insert(schema.userModel)
      .values({ email: `social-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await database
      .insert(schema.workspaceModel)
      .values({ name: `social-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    const [other] = await database
      .insert(schema.workspaceModel)
      .values({ name: `social-other-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    fixture = {
      otherWorkspaceId: other.id,
      userId: user.id,
      workspaceId: workspace.id,
    }
  })

  afterAll(async () => {
    if (fixture) {
      const database = drizzle({ client, relations, schema })
      for (const id of [fixture.workspaceId, fixture.otherWorkspaceId]) {
        await database
          .delete(schema.workspaceModel)
          .where(eq(schema.workspaceModel.id, id))
      }
      await database
        .delete(schema.userModel)
        .where(eq(schema.userModel.id, fixture.userId))
    }
    await client?.end()
  })

  describe("identity", () => {
    test("a reconnect of the same login keeps its row and refreshes its fields", async () => {
      const first = identity({
        displayName: "Old",
        externalAccountId: "fb-keep",
      })
      const id = await socialAccountRepository.upsertIdentity(first)
      await client.query(
        `UPDATE "SocialAccount" SET status = 'needsReauth', "statusReason" = 'x', "refreshLeaseExpiresAt" = now() WHERE id = $1`,
        [id],
      )

      const again = await socialAccountRepository.upsertIdentity({
        ...first,
        displayName: "New",
        id: nextId(),
      })

      expect(again).toBe(id)
      expect(await row(id)).toMatchObject({
        displayName: "New",
        refreshLeaseExpiresAt: null,
        status: "connected",
        statusReason: null,
      })
    })

    test("two concurrent connects of a new login end with one row and one id", async () => {
      const base = identity({ externalAccountId: "fb-race" })

      const ids = await Promise.all([
        socialAccountRepository.upsertIdentity({ ...base, id: nextId() }),
        socialAccountRepository.upsertIdentity({ ...base, id: nextId() }),
      ])

      expect(new Set(ids).size).toBe(1)
      const rows = await client.query(
        `SELECT id FROM "SocialAccount" WHERE "workspaceId" = $1 AND "externalAccountId" = 'fb-race'`,
        [fixture.workspaceId],
      )
      expect(rows.rows).toHaveLength(1)
    })

    test("the same login id in another workspace is a separate account", async () => {
      const base = identity({ externalAccountId: "fb-shared" })

      const a = await socialAccountRepository.upsertIdentity(base)
      const b = await socialAccountRepository.upsertIdentity({
        ...base,
        id: nextId(),
        workspaceId: fixture.otherWorkspaceId,
      })

      expect(new Set([a, b]).size).toBe(2)
    })

    test("a lookup is scoped to the workspace", async () => {
      const id = await socialAccountRepository.upsertIdentity(identity())

      expect(
        await socialAccountRepository.findForWorkspace({
          id,
          workspaceId: fixture.otherWorkspaceId,
        }),
      ).toBeNull()
      expect(
        await socialAccountRepository.findForWorkspace({
          id,
          workspaceId: fixture.workspaceId,
        }),
      ).not.toBeNull()
    })
  })

  describe("tokens", () => {
    test("list and find never select a token column", async () => {
      const id = await socialAccountRepository.upsertIdentity(identity())
      await socialAccountRepository.saveTokens({
        accessToken: blob("a"),
        id,
        refreshToken: blob("r"),
        workspaceId: fixture.workspaceId,
      })

      const [listed] = (
        await socialAccountRepository.list(fixture.workspaceId)
      ).filter((account) => account.id === id)
      const found = await socialAccountRepository.findForWorkspace({
        id,
        workspaceId: fixture.workspaceId,
      })

      for (const account of [listed, found]) {
        expect(Object.keys(account ?? {})).not.toContain("accessToken")
        expect(Object.keys(account ?? {})).not.toContain("refreshToken")
      }
    })

    test("the tokens round-trip only through findTokens, scoped to the workspace", async () => {
      const id = await socialAccountRepository.upsertIdentity(identity())
      await socialAccountRepository.saveTokens({
        accessToken: blob("a"),
        id,
        refreshToken: null,
        workspaceId: fixture.workspaceId,
      })

      const tokens = await socialAccountRepository.findTokens({
        id,
        workspaceId: fixture.workspaceId,
      })
      const foreign = await socialAccountRepository.findTokens({
        id,
        workspaceId: fixture.otherWorkspaceId,
      })

      expect(tokens?.accessToken).toEqual({ label: "a" })
      expect(foreign).toBeNull()
    })
  })

  describe("destinations", () => {
    const destination = (externalId: string, name: string) => ({
      avatar: null,
      externalId,
      id: nextId(),
      isActive: true,
      kind: "page" as const,
      name,
      username: null,
    })

    test("a second sync merges by externalId: same ids, new names", async () => {
      const accountId = await socialAccountRepository.upsertIdentity(identity())
      const ids = (
        rows: { externalId: string; id: string }[],
      ): Record<string, string> =>
        Object.fromEntries(rows.map((entry) => [entry.externalId, entry.id]))

      const first = ids(
        await socialAccountRepository.upsertDestinations({
          destinations: [destination("p1", "One"), destination("p2", "Two")],
          now: new Date(),
          socialAccountId: accountId,
          workspaceId: fixture.workspaceId,
        }),
      )
      const second = ids(
        await socialAccountRepository.upsertDestinations({
          destinations: [
            destination("p1", "One renamed"),
            destination("p3", "Three"),
          ],
          now: new Date(),
          socialAccountId: accountId,
          workspaceId: fixture.workspaceId,
        }),
      )

      expect(second.p1).toBe(first.p1)
      const listed = await socialAccountRepository.listDestinations({
        accountIds: [accountId],
        workspaceId: fixture.workspaceId,
      })
      expect(listed.map((entry) => entry.externalId).sort()).toEqual([
        "p1",
        "p2",
        "p3",
      ])
      expect(listed.find((entry) => entry.externalId === "p1")?.name).toBe(
        "One renamed",
      )
    })

    test("destinations the platform stopped listing become inactive and lose their token", async () => {
      const accountId = await socialAccountRepository.upsertIdentity(identity())
      const stored = await socialAccountRepository.upsertDestinations({
        destinations: [destination("p1", "One"), destination("p2", "Two")],
        now: new Date(),
        socialAccountId: accountId,
        workspaceId: fixture.workspaceId,
      })
      await socialAccountRepository.saveDestinationTokens({
        tokens: stored.map(({ id }) => ({ id, token: blob(id) })),
        workspaceId: fixture.workspaceId,
      })

      await socialAccountRepository.deactivateMissingDestinations({
        keepExternalIds: ["p1"],
        now: new Date(),
        socialAccountId: accountId,
        workspaceId: fixture.workspaceId,
      })

      const rows = await client.query(
        `SELECT "externalId", "isActive", "accessToken" FROM "SocialAccountDestination" WHERE "socialAccountId" = $1 ORDER BY "externalId"`,
        [accountId],
      )
      expect(
        rows.rows.map((entry) => [
          entry.externalId,
          entry.isActive,
          entry.accessToken !== null,
        ]),
      ).toEqual([
        ["p1", true, true],
        ["p2", false, false],
      ])
    })

    test("a destination token write can wipe a token with null", async () => {
      const accountId = await socialAccountRepository.upsertIdentity(identity())
      const [stored] = await socialAccountRepository.upsertDestinations({
        destinations: [destination("p1", "One")],
        now: new Date(),
        socialAccountId: accountId,
        workspaceId: fixture.workspaceId,
      })
      await socialAccountRepository.saveDestinationTokens({
        tokens: [{ id: stored?.id ?? "", token: blob("t") }],
        workspaceId: fixture.workspaceId,
      })
      await socialAccountRepository.saveDestinationTokens({
        tokens: [{ id: stored?.id ?? "", token: null }],
        workspaceId: fixture.workspaceId,
      })

      const rows = await client.query(
        `SELECT "accessToken" FROM "SocialAccountDestination" WHERE id = $1`,
        [stored?.id],
      )
      expect(rows.rows[0]?.accessToken).toBeNull()
    })

    test("a token write never touches another workspace's destination", async () => {
      const accountId = await socialAccountRepository.upsertIdentity(identity())
      const [stored] = await socialAccountRepository.upsertDestinations({
        destinations: [destination("p1", "One")],
        now: new Date(),
        socialAccountId: accountId,
        workspaceId: fixture.workspaceId,
      })

      await socialAccountRepository.saveDestinationTokens({
        tokens: [{ id: stored?.id ?? "", token: blob("intruder") }],
        workspaceId: fixture.otherWorkspaceId,
      })

      const rows = await client.query(
        `SELECT "accessToken" FROM "SocialAccountDestination" WHERE id = $1`,
        [stored?.id],
      )
      expect(rows.rows[0]?.accessToken).toBeNull()
    })
  })

  describe("disconnect and cascade", () => {
    test("disconnecting wipes the tokens of the account and its destinations", async () => {
      const accountId = await socialAccountRepository.upsertIdentity(
        identity({ tokenExpiresAt: new Date(Date.now() + DAY) }),
      )
      await socialAccountRepository.saveTokens({
        accessToken: blob("a"),
        id: accountId,
        refreshToken: blob("r"),
        workspaceId: fixture.workspaceId,
      })
      const [stored] = await socialAccountRepository.upsertDestinations({
        destinations: [
          {
            avatar: null,
            externalId: "p1",
            id: nextId(),
            isActive: true,
            kind: "page",
            name: "One",
            username: null,
          },
        ],
        now: new Date(),
        socialAccountId: accountId,
        workspaceId: fixture.workspaceId,
      })
      await socialAccountRepository.saveDestinationTokens({
        tokens: [{ id: stored?.id ?? "", token: blob("d") }],
        workspaceId: fixture.workspaceId,
      })

      const done = await socialAccountRepository.disconnect({
        id: accountId,
        workspaceId: fixture.workspaceId,
      })

      expect(done).toBe(true)
      expect(await row(accountId)).toMatchObject({
        accessToken: null,
        refreshToken: null,
        status: "disconnected",
        tokenExpiresAt: null,
      })
      const destinationRow = await client.query(
        `SELECT "accessToken", "isActive" FROM "SocialAccountDestination" WHERE id = $1`,
        [stored?.id],
      )
      expect(destinationRow.rows[0]).toEqual({
        accessToken: null,
        isActive: false,
      })
    })

    test("another workspace cannot disconnect the account", async () => {
      const accountId = await socialAccountRepository.upsertIdentity(identity())

      const done = await socialAccountRepository.disconnect({
        id: accountId,
        workspaceId: fixture.otherWorkspaceId,
      })

      expect(done).toBe(false)
      expect((await row(accountId)).status).toBe("connected")
    })

    test("deleting the workspace removes its accounts and destinations", async () => {
      const database = drizzle({ client, relations, schema })
      const [workspace] = await database
        .insert(schema.workspaceModel)
        .values({
          name: `social-cascade-${Date.now()}`,
          ownerId: fixture.userId,
        })
        .returning({ id: schema.workspaceModel.id })
      const accountId = await socialAccountRepository.upsertIdentity(
        identity({ workspaceId: workspace.id }),
      )
      await socialAccountRepository.upsertDestinations({
        destinations: [
          {
            avatar: null,
            externalId: "p1",
            id: nextId(),
            isActive: true,
            kind: "page",
            name: "One",
            username: null,
          },
        ],
        now: new Date(),
        socialAccountId: accountId,
        workspaceId: workspace.id,
      })

      await database
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspace.id))

      expect(await row(accountId)).toBeUndefined()
      const destinations = await client.query(
        `SELECT 1 FROM "SocialAccountDestination" WHERE "socialAccountId" = $1`,
        [accountId],
      )
      expect(destinations.rows).toHaveLength(0)
    })
  })

  describe("the refresh scanner", () => {
    const now = () => new Date()
    const expiring = (days: number) => new Date(Date.now() + days * DAY)

    const dueAccount = (
      overrides: Partial<
        Parameters<typeof socialAccountRepository.upsertIdentity>[0]
      > = {},
    ) =>
      socialAccountRepository.upsertIdentity(
        identity({
          provider: "tiktok",
          tokenExpiresAt: expiring(3),
          ...overrides,
        }),
      )

    const claim = (
      providers: Parameters<
        typeof socialAccountRepository.claimDueForRefresh
      >[0]["providers"] = ["tiktok"],
      limit = 500,
    ) =>
      socialAccountRepository.claimDueForRefresh({
        expiresBefore: expiring(14),
        leaseUntil: new Date(Date.now() + 15 * 60_000),
        limit,
        now: now(),
        providers,
      })

    test("claims a connected account that expires soon, and only once while it holds the lease", async () => {
      const id = await dueAccount()

      const first = (await claim()).map((entry) => entry.id)
      const second = (await claim()).map((entry) => entry.id)

      expect(first).toContain(id)
      expect(second).not.toContain(id)
    })

    test("two concurrent workers never claim the same account", async () => {
      const ids = await Promise.all(
        Array.from({ length: 6 }, () => dueAccount()),
      )

      const [a, b] = await Promise.all([claim(), claim()])
      const claimedA = a
        .map((entry) => entry.id)
        .filter((id) => ids.includes(id))
      const claimedB = b
        .map((entry) => entry.id)
        .filter((id) => ids.includes(id))

      expect([...claimedA, ...claimedB].sort()).toEqual([...ids].sort())
      expect(claimedA.filter((id) => claimedB.includes(id))).toEqual([])
    })

    test("skips an account whose token is not near expiry, one that never expires, and other networks", async () => {
      const far = await dueAccount({ tokenExpiresAt: expiring(40) })
      const never = await dueAccount({ tokenExpiresAt: null })
      const tiktok = await dueAccount()

      const claimed = (await claim()).map((entry) => entry.id)
      const otherNetwork = (await claim(["threads"])).map((entry) => entry.id)

      expect(claimed).not.toContain(far)
      expect(claimed).not.toContain(never)
      expect(claimed).toContain(tiktok)
      expect(otherNetwork).not.toContain(tiktok)
    })

    test("skips an account that needs a reconnect or was disconnected", async () => {
      const reauth = await dueAccount()
      const gone = await dueAccount()
      await socialAccountRepository.setStatus({
        id: reauth,
        reason: "tokenRejected",
        status: "needsReauth",
        workspaceId: fixture.workspaceId,
      })
      await socialAccountRepository.disconnect({
        id: gone,
        workspaceId: fixture.workspaceId,
      })

      const claimed = (await claim()).map((entry) => entry.id)

      expect(claimed).not.toContain(reauth)
      expect(claimed).not.toContain(gone)
    })

    test("an expired lease makes the account claimable again", async () => {
      const id = await dueAccount()
      await claim()
      await client.query(
        `UPDATE "SocialAccount" SET "refreshLeaseExpiresAt" = now() - interval '1 minute' WHERE id = $1`,
        [id],
      )

      expect((await claim()).map((entry) => entry.id)).toContain(id)
    })

    test("an unreadable token moves the account to needsReauth only under the claimed lease", async () => {
      const id = await dueAccount()
      const [claimed] = (await claim()).filter((entry) => entry.id === id)
      const lease = claimed?.leaseUntil as Date

      const changed = await socialAccountRepository.setNeedsReauthUnderLease({
        id,
        leaseUntil: lease,
        reason: "refreshRejected",
        workspaceId: fixture.workspaceId,
      })

      expect(changed).toBe(true)
      expect((await row(id)).status).toBe("needsReauth")
      expect((await row(id)).refreshLeaseExpiresAt).toBeNull()
    })

    test("an unreadable-token write does nothing once a reconnect changed the lease", async () => {
      const id = await dueAccount()
      const [claimed] = (await claim()).filter((entry) => entry.id === id)
      await client.query(
        `UPDATE "SocialAccount" SET "refreshLeaseExpiresAt" = NULL WHERE id = $1`,
        [id],
      )

      const changed = await socialAccountRepository.setNeedsReauthUnderLease({
        id,
        leaseUntil: claimed?.leaseUntil as Date,
        reason: "refreshRejected",
        workspaceId: fixture.workspaceId,
      })

      expect(changed).toBe(false)
      expect((await row(id)).status).toBe("connected")
    })

    test("an empty provider list claims nothing", async () => {
      await dueAccount()

      expect(await claim([])).toEqual([])
    })

    test("a refreshed token is stored and the lease released, only while connected", async () => {
      const id = await dueAccount()
      await socialAccountRepository.saveTokens({
        accessToken: blob("old"),
        id,
        refreshToken: null,
        workspaceId: fixture.workspaceId,
      })
      const [claimed] = (await claim()).filter((entry) => entry.id === id)
      const fence = {
        leaseUntil: claimed?.leaseUntil as Date,
        readAccessToken: blob("old"),
      }

      const applied = await socialAccountRepository.applyRefreshedToken({
        accessToken: blob("new"),
        fence,
        id,
        tokenExpiresAt: expiring(60),
        workspaceId: fixture.workspaceId,
      })

      expect(applied).toBe(true)
      expect((await row(id)).accessToken).toEqual({ label: "new" })
      expect((await row(id)).refreshLeaseExpiresAt).toBeNull()
    })

    test("a refresh does not store once the account needs a reconnect", async () => {
      const id = await dueAccount()
      await socialAccountRepository.saveTokens({
        accessToken: blob("old"),
        id,
        refreshToken: null,
        workspaceId: fixture.workspaceId,
      })
      const [claimed] = (await claim()).filter((entry) => entry.id === id)
      await socialAccountRepository.setStatus({
        id,
        reason: "tokenRejected",
        status: "needsReauth",
        workspaceId: fixture.workspaceId,
      })

      const applied = await socialAccountRepository.applyRefreshedToken({
        accessToken: blob("late"),
        fence: {
          leaseUntil: claimed?.leaseUntil as Date,
          readAccessToken: blob("old"),
        },
        id,
        tokenExpiresAt: expiring(60),
        workspaceId: fixture.workspaceId,
      })

      expect(applied).toBe(false)
      expect((await row(id)).accessToken).toEqual({ label: "old" })
    })

    test("a deferred refresh holds the lease until the retry time", async () => {
      const id = await dueAccount()
      await socialAccountRepository.saveTokens({
        accessToken: blob("old"),
        id,
        refreshToken: null,
        workspaceId: fixture.workspaceId,
      })
      const [claimed] = (await claim()).filter((entry) => entry.id === id)

      const deferred = await socialAccountRepository.deferRefresh({
        fence: {
          leaseUntil: claimed?.leaseUntil as Date,
          readAccessToken: blob("old"),
        },
        id,
        retryAt: new Date(Date.now() + 30 * 60_000),
        workspaceId: fixture.workspaceId,
      })

      expect(deferred).toBe(true)
      expect((await claim()).map((entry) => entry.id)).not.toContain(id)
    })

    test("the claim returns the lease it set, which is what the completion must present", async () => {
      const id = await dueAccount()

      const [claimed] = (await claim()).filter((entry) => entry.id === id)

      expect(claimed?.leaseUntil).toBeInstanceOf(Date)
      expect((await row(id)).refreshLeaseExpiresAt.getTime()).toBe(
        claimed?.leaseUntil.getTime(),
      )
    })

    describe("fencing", () => {
      const prepare = async () => {
        const id = await dueAccount()
        await socialAccountRepository.saveTokens({
          accessToken: blob("A"),
          id,
          refreshToken: null,
          workspaceId: fixture.workspaceId,
        })
        return id
      }
      const pause = () => new Promise((resolve) => setTimeout(resolve, 5))

      test("a reconnect between the claim and the refresh keeps the new token", async () => {
        const id = await prepare()
        const [claimed] = (await claim()).filter((entry) => entry.id === id)
        // The person reconnects while the refresh call is in flight.
        await socialAccountRepository.upsertIdentity(
          identity({
            externalAccountId: (await row(id)).externalAccountId,
            id: nextId(),
            provider: "tiktok",
            tokenExpiresAt: expiring(60),
          }),
        )
        await socialAccountRepository.saveTokens({
          accessToken: blob("B"),
          id,
          refreshToken: null,
          workspaceId: fixture.workspaceId,
        })

        const applied = await socialAccountRepository.applyRefreshedToken({
          accessToken: blob("refreshed-from-A"),
          fence: {
            leaseUntil: claimed?.leaseUntil as Date,
            readAccessToken: blob("A"),
          },
          id,
          tokenExpiresAt: expiring(60),
          workspaceId: fixture.workspaceId,
        })

        expect(applied).toBe(false)
        expect((await row(id)).accessToken).toEqual({ label: "B" })
      })

      test("after the lease expired and another worker claimed, only the new owner completes", async () => {
        const id = await prepare()
        const [first] = (await claim()).filter((entry) => entry.id === id)
        await client.query(
          `UPDATE "SocialAccount" SET "refreshLeaseExpiresAt" = now() - interval '1 minute' WHERE id = $1`,
          [id],
        )
        await pause()
        const [second] = (await claim()).filter((entry) => entry.id === id)
        const complete = (leaseUntil: Date, label: string) =>
          socialAccountRepository.applyRefreshedToken({
            accessToken: blob(label),
            fence: { leaseUntil, readAccessToken: blob("A") },
            id,
            tokenExpiresAt: expiring(60),
            workspaceId: fixture.workspaceId,
          })

        const oldWorker = await complete(first?.leaseUntil as Date, "from-old")
        const newWorker = await complete(second?.leaseUntil as Date, "from-new")

        expect(second?.leaseUntil.getTime()).not.toBe(
          first?.leaseUntil.getTime(),
        )
        expect(oldWorker).toBe(false)
        expect(newWorker).toBe(true)
        expect((await row(id)).accessToken).toEqual({ label: "from-new" })
      })

      test("an old worker cannot defer the lease another worker holds", async () => {
        const id = await prepare()
        const [first] = (await claim()).filter((entry) => entry.id === id)
        await client.query(
          `UPDATE "SocialAccount" SET "refreshLeaseExpiresAt" = now() - interval '1 minute' WHERE id = $1`,
          [id],
        )
        await pause()
        const [second] = (await claim()).filter((entry) => entry.id === id)

        const deferred = await socialAccountRepository.deferRefresh({
          fence: {
            leaseUntil: first?.leaseUntil as Date,
            readAccessToken: blob("A"),
          },
          id,
          retryAt: new Date(Date.now() + 60 * 60_000),
          workspaceId: fixture.workspaceId,
        })

        expect(deferred).toBe(false)
        expect((await row(id)).refreshLeaseExpiresAt.getTime()).toBe(
          second?.leaseUntil.getTime(),
        )
      })

      test("a rejected token after a disconnect leaves the account disconnected", async () => {
        const id = await prepare()
        await socialAccountRepository.disconnect({
          id,
          workspaceId: fixture.workspaceId,
        })

        const changed = await socialAccountRepository.setStatus({
          fence: { readAccessToken: blob("A") },
          id,
          reason: "tokenRejected",
          status: "needsReauth",
          workspaceId: fixture.workspaceId,
        })

        expect(changed).toBe(false)
        expect((await row(id)).status).toBe("disconnected")
      })

      test("a status change without a fence still never revives a disconnected account", async () => {
        const id = await prepare()
        await socialAccountRepository.disconnect({
          id,
          workspaceId: fixture.workspaceId,
        })

        const reauth = await socialAccountRepository.setStatus({
          id,
          reason: "tokenRejected",
          status: "needsReauth",
          workspaceId: fixture.workspaceId,
        })
        const connected = await socialAccountRepository.setStatus({
          id,
          reason: null,
          status: "connected",
          workspaceId: fixture.workspaceId,
        })

        expect([reauth, connected]).toEqual([false, false])
        expect((await row(id)).status).toBe("disconnected")
      })

      test("a rejected token read before a reconnect does not mark the new connection", async () => {
        const id = await prepare()
        // The person reconnects with a new token while the verify call is in flight.
        await socialAccountRepository.saveTokens({
          accessToken: blob("B"),
          id,
          refreshToken: null,
          workspaceId: fixture.workspaceId,
        })

        const changed = await socialAccountRepository.setStatus({
          fence: { readAccessToken: blob("A") },
          id,
          reason: "tokenRejected",
          status: "needsReauth",
          workspaceId: fixture.workspaceId,
        })

        expect(changed).toBe(false)
        expect((await row(id)).status).toBe("connected")
      })

      test("a rejected token that is still the stored one marks the account", async () => {
        const id = await prepare()

        const changed = await socialAccountRepository.setStatus({
          fence: { readAccessToken: blob("A") },
          id,
          reason: "tokenRejected",
          status: "needsReauth",
          workspaceId: fixture.workspaceId,
        })

        expect(changed).toBe(true)
        expect(await row(id)).toMatchObject({
          status: "needsReauth",
          statusReason: "tokenRejected",
        })
      })

      test("a cron status change also needs the lease it claimed", async () => {
        const id = await prepare()
        const [claimed] = (await claim()).filter((entry) => entry.id === id)
        await client.query(
          `UPDATE "SocialAccount" SET "refreshLeaseExpiresAt" = now() - interval '1 minute' WHERE id = $1`,
          [id],
        )
        await pause()
        await claim()

        const changed = await socialAccountRepository.setStatus({
          fence: {
            leaseUntil: claimed?.leaseUntil as Date,
            readAccessToken: blob("A"),
          },
          id,
          reason: "refreshRejected",
          status: "needsReauth",
          workspaceId: fixture.workspaceId,
        })

        expect(changed).toBe(false)
        expect((await row(id)).status).toBe("connected")
      })
    })
  })

  describe("status changes", () => {
    test("needsReauth keeps the reason and releases the lease", async () => {
      const id = await socialAccountRepository.upsertIdentity(identity())
      await client.query(
        `UPDATE "SocialAccount" SET "refreshLeaseExpiresAt" = now() WHERE id = $1`,
        [id],
      )

      await socialAccountRepository.setStatus({
        id,
        reason: "tokenRejected",
        status: "needsReauth",
        workspaceId: fixture.workspaceId,
      })

      expect(await row(id)).toMatchObject({
        refreshLeaseExpiresAt: null,
        status: "needsReauth",
        statusReason: "tokenRejected",
      })
    })

    test("a status change in another workspace changes nothing", async () => {
      const id = await socialAccountRepository.upsertIdentity(identity())

      const changed = await socialAccountRepository.setStatus({
        id,
        reason: "tokenRejected",
        status: "needsReauth",
        workspaceId: fixture.otherWorkspaceId,
      })

      expect(changed).toBe(false)
      expect((await row(id)).status).toBe("connected")
    })

    test("a verification records the granted permissions only when the platform reported them", async () => {
      const id = await socialAccountRepository.upsertIdentity(
        identity({ grantedScopes: ["keep"] }),
      )

      await socialAccountRepository.recordVerified({
        grantedScopes: null,
        id,
        now: new Date(),
        workspaceId: fixture.workspaceId,
      })
      expect((await row(id)).grantedScopes).toEqual(["keep"])

      await socialAccountRepository.recordVerified({
        grantedScopes: ["new"],
        id,
        now: new Date(),
        workspaceId: fixture.workspaceId,
      })
      expect((await row(id)).grantedScopes).toEqual(["new"])
      expect((await row(id)).lastVerifiedAt).not.toBeNull()
    })

    test("a verification does not write over a token reconnected after it was read", async () => {
      const id = await socialAccountRepository.upsertIdentity(
        identity({ grantedScopes: ["keep"] }),
      )
      await socialAccountRepository.saveTokens({
        accessToken: blob("new"),
        id,
        refreshToken: null,
        workspaceId: fixture.workspaceId,
      })

      await socialAccountRepository.recordVerified({
        fence: { readAccessToken: blob("old") },
        grantedScopes: ["stale"],
        id,
        now: new Date(),
        workspaceId: fixture.workspaceId,
      })

      expect((await row(id)).grantedScopes).toEqual(["keep"])
    })
  })
})
