// @vitest-environment node

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import { mobileRefreshTokenRepository } from "../../src/repositories/mobile-refresh-token/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors src/client.ts schema wiring.
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

describe.skipIf(!databaseUrl)(
  "mobileRefreshTokenRepository against Postgres",
  () => {
    let clientA: Client
    let clientB: Client
    let dbA: ReturnType<typeof createDatabase>
    let dbB: ReturnType<typeof createDatabase>
    let userId: string

    const insert = async (input: {
      tokenHash: string
      familyId?: string
      expiresAt?: Date
      rotatedAt?: Date
    }) => {
      await mobileRefreshTokenRepository.insert(
        {
          userId,
          deviceId: "device-a",
          familyId: input.familyId ?? "family-a",
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt ?? new Date(Date.now() + 60_000),
          ...(input.rotatedAt && { rotatedAt: input.rotatedAt }),
        },
        dbA,
      )
    }

    beforeAll(async () => {
      clientA = new Client({ connectionString: databaseUrl as string })
      clientB = new Client({ connectionString: databaseUrl as string })
      await Promise.all([clientA.connect(), clientB.connect()])
      dbA = createDatabase(clientA)
      dbB = createDatabase(clientB)
      const [user] = await dbA
        .insert(schema.userModel)
        .values({ email: `mobile-refresh-${Date.now()}@example.test` })
        .returning({ id: schema.userModel.id })
      userId = user.id
    })

    afterAll(async () => {
      await dbA.delete(schema.userModel).where(eq(schema.userModel.id, userId))
      await Promise.all([clientA.end(), clientB.end()])
    })

    test("allows exactly one concurrent active-token spend", async () => {
      await insert({ tokenHash: "concurrent" })
      const now = new Date()
      const [left, right] = await Promise.all([
        mobileRefreshTokenRepository.spendActive("concurrent", now, dbA),
        mobileRefreshTokenRepository.spendActive("concurrent", now, dbB),
      ])

      expect([left, right].filter(Boolean)).toHaveLength(1)
    })

    test("revokes every token in a replayed family", async () => {
      await insert({ tokenHash: "replayed", familyId: "family-replayed" })
      await insert({ tokenHash: "successor", familyId: "family-replayed" })

      await mobileRefreshTokenRepository.revokeFamilyByHash(
        "replayed",
        new Date(),
        dbA,
      )

      const rows = await dbA.query.mobileRefreshTokenModel.findMany({
        where: { familyId: "family-replayed" },
      })
      expect(rows.every((row) => row.revoked instanceof Date)).toBe(true)
    })

    test("serializes replay revocation against successor rotation", async () => {
      const familyId = "family-race"
      await insert({
        tokenHash: "replayed",
        familyId,
        rotatedAt: new Date(Date.now() - 60_000),
      })
      await insert({ tokenHash: "active", familyId })

      const replayLocked = Promise.withResolvers<void>()
      const releaseReplay = Promise.withResolvers<void>()
      const replay = dbA.transaction(async (tx) => {
        await mobileRefreshTokenRepository.lockFamilyByHash("replayed", tx)
        replayLocked.resolve()
        await releaseReplay.promise
        await mobileRefreshTokenRepository.revokeFamilyByHash(
          "replayed",
          new Date(),
          tx,
        )
      })

      await replayLocked.promise
      const successorRotation = dbB.transaction(async (tx) => {
        await mobileRefreshTokenRepository.lockFamilyByHash("active", tx)
        const spent = await mobileRefreshTokenRepository.spendActive(
          "active",
          new Date(),
          tx,
        )
        if (!spent) {
          return false
        }
        await mobileRefreshTokenRepository.insert(
          {
            userId,
            deviceId: "device-a",
            familyId,
            tokenHash: "successor",
            expiresAt: new Date(Date.now() + 60_000),
          },
          tx,
        )
        return true
      })

      releaseReplay.resolve()
      await replay

      await expect(successorRotation).resolves.toBe(false)
      const rows = await dbA.query.mobileRefreshTokenModel.findMany({
        where: { familyId },
      })
      expect(rows).toHaveLength(2)
      expect(rows.every((row) => row.revoked instanceof Date)).toBe(true)
    })

    test("does not spend an expired token", async () => {
      await insert({
        tokenHash: "expired",
        expiresAt: new Date(Date.now() - 1000),
      })

      await expect(
        mobileRefreshTokenRepository.spendActive("expired", new Date(), dbA),
      ).resolves.toBeNull()
    })

    test("deletes only spent tokens older than the cutoff", async () => {
      const cutoff = new Date(Date.now() - 60_000)
      await insert({
        tokenHash: "spent-old",
        familyId: "family-cleanup",
        rotatedAt: new Date(cutoff.getTime() - 1),
      })
      await insert({
        tokenHash: "spent-new",
        familyId: "family-cleanup",
        rotatedAt: new Date(cutoff.getTime() + 1),
      })

      await mobileRefreshTokenRepository.deleteSpentInFamily(
        "family-cleanup",
        cutoff,
        dbA,
      )

      const rows = await dbA.query.mobileRefreshTokenModel.findMany({
        where: { familyId: "family-cleanup" },
      })
      expect(rows.map((row) => row.tokenHash)).toEqual(["spent-new"])
    })
  },
)
