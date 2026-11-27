// @vitest-environment node

import { encryptUtils } from "@chatbotx.io/encryption"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import {
  type UserConnectionAuthorization,
  userConnectionAuthorizationAad,
} from "../../src/partials/connection"
import type { IntegrationType } from "../../src/partials/integration"
import { relations } from "../../src/relations"
import { userRepository } from "../../src/repositories/user/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const OLDER = "2026-11-18T10:00:00.000Z"
const NEWER = "2026-11-18T10:00:05.000Z"

describe.skipIf(!databaseUrl)(
  "userRepository.recordConnectionAuthorization against Postgres",
  () => {
    let pool: Pool
    let db: DatabaseClient
    const createdUserIds: string[] = []

    beforeAll(() => {
      pool = new Pool({ connectionString: databaseUrl as string, max: 4 })
      db = drizzle({ client: pool, schema, relations })
    })

    afterEach(async () => {
      for (const id of createdUserIds.splice(0)) {
        await db.delete(schema.userModel).where(eq(schema.userModel.id, id))
      }
    })

    afterAll(async () => {
      await pool.end()
    })

    const seedUser = async (): Promise<string> => {
      const [user] = await db
        .insert(schema.userModel)
        .values({
          email: `connection-authorization-${Date.now()}-${Math.random()}@example.test`,
        })
        .returning({ id: schema.userModel.id })
      createdUserIds.push(user.id)
      return user.id
    }

    const buildEntry = async (input: {
      userId: string
      provider: IntegrationType
      capturedAt: string
      token: string
    }): Promise<UserConnectionAuthorization> => ({
      encryptedAuth: await encryptUtils.encryptObject(
        { accessToken: input.token },
        userConnectionAuthorizationAad(input.userId, input.provider),
      ),
      phase: "authorizationObtained",
      purpose: null,
      workspaceId: "workspace-1",
      connectSessionId: null,
      candidateCount: null,
      unavailableCandidateCount: null,
      connectSessionErrorCode: null,
      capturedAt: input.capturedAt,
    })

    const readRow = async (userId: string) => {
      const row = await db.query.userModel.findFirst({
        where: { id: userId },
        columns: { connectionAuthorizations: true, updatedAt: true },
      })
      if (!row) {
        throw new Error("seeded user missing")
      }
      return row
    }

    const record = async (input: {
      userId: string
      provider: IntegrationType
      capturedAt: string
      token: string
    }) =>
      await userRepository.recordConnectionAuthorization(
        {
          userId: input.userId,
          provider: input.provider,
          entry: await buildEntry(input),
        },
        db,
      )

    test("writes into a NULL column", async () => {
      const userId = await seedUser()

      const written = await record({
        userId,
        provider: "messenger",
        capturedAt: OLDER,
        token: "t1",
      })

      expect(written).toBe(true)
      const row = await readRow(userId)
      expect(row.connectionAuthorizations?.messenger?.capturedAt).toBe(OLDER)
    })

    test("two providers written concurrently both survive", async () => {
      const userId = await seedUser()

      await Promise.all([
        record({
          userId,
          provider: "messenger",
          capturedAt: OLDER,
          token: "m",
        }),
        record({
          userId,
          provider: "instagram",
          capturedAt: OLDER,
          token: "i",
        }),
        record({ userId, provider: "whatsapp", capturedAt: OLDER, token: "w" }),
      ])

      const row = await readRow(userId)
      expect(Object.keys(row.connectionAuthorizations ?? {}).sort()).toEqual([
        "instagram",
        "messenger",
        "whatsapp",
      ])
    })

    test("same provider completing in reverse order keeps the newer entry", async () => {
      const userId = await seedUser()

      await record({
        userId,
        provider: "messenger",
        capturedAt: NEWER,
        token: "newer",
      })
      const olderWritten = await record({
        userId,
        provider: "messenger",
        capturedAt: OLDER,
        token: "older",
      })

      expect(olderWritten).toBe(false)
      const stored = (await readRow(userId)).connectionAuthorizations?.messenger
      expect(stored?.capturedAt).toBe(NEWER)
      const auth = await encryptUtils.decryptText(
        stored?.encryptedAuth as UserConnectionAuthorization["encryptedAuth"],
        userConnectionAuthorizationAad(userId, "messenger"),
      )
      expect(JSON.parse(auth)).toEqual({ accessToken: "newer" })
    })

    test("clearConnectionAuthorizations nulls the column and is idempotent", async () => {
      const userId = await seedUser()
      await record({
        userId,
        provider: "messenger",
        capturedAt: OLDER,
        token: "a",
      })

      await userRepository.clearConnectionAuthorizations(userId, db)
      await userRepository.clearConnectionAuthorizations(userId, db)

      expect((await readRow(userId)).connectionAuthorizations).toBeNull()
    })

    test("a newer entry replaces an older one", async () => {
      const userId = await seedUser()
      await record({
        userId,
        provider: "messenger",
        capturedAt: OLDER,
        token: "a",
      })

      const written = await record({
        userId,
        provider: "messenger",
        capturedAt: NEWER,
        token: "b",
      })

      expect(written).toBe(true)
      expect(
        (await readRow(userId)).connectionAuthorizations?.messenger?.capturedAt,
      ).toBe(NEWER)
    })

    test("a replay with the same capturedAt does not rewrite the entry", async () => {
      const userId = await seedUser()
      await record({
        userId,
        provider: "messenger",
        capturedAt: NEWER,
        token: "first",
      })
      const before = (await readRow(userId)).connectionAuthorizations?.messenger

      const replayed = await record({
        userId,
        provider: "messenger",
        capturedAt: NEWER,
        token: "replay",
      })

      expect(replayed).toBe(false)
      expect(
        (await readRow(userId)).connectionAuthorizations?.messenger,
      ).toEqual(before)
    })

    test("leaves updatedAt unchanged", async () => {
      const userId = await seedUser()
      const before = (await readRow(userId)).updatedAt

      await record({
        userId,
        provider: "messenger",
        capturedAt: OLDER,
        token: "t",
      })
      await record({
        userId,
        provider: "messenger",
        capturedAt: NEWER,
        token: "t2",
      })

      expect((await readRow(userId)).updatedAt).toEqual(before)
    })

    test("does not write for a user with a pending account deletion", async () => {
      const userId = await seedUser()
      await db
        .update(schema.userModel)
        .set({ deletionRequestedAt: new Date() })
        .where(eq(schema.userModel.id, userId))

      const written = await record({
        userId,
        provider: "messenger",
        capturedAt: OLDER,
        token: "t",
      })

      expect(written).toBe(false)
      expect((await readRow(userId)).connectionAuthorizations).toBeNull()
    })

    test("returns false for an unknown user", async () => {
      const written = await record({
        userId: "0",
        provider: "messenger",
        capturedAt: OLDER,
        token: "t",
      })

      expect(written).toBe(false)
    })

    test("decrypting with another user's or provider's AAD fails", async () => {
      const userId = await seedUser()
      await record({
        userId,
        provider: "messenger",
        capturedAt: OLDER,
        token: "t",
      })
      const encrypted = (await readRow(userId)).connectionAuthorizations
        ?.messenger
        ?.encryptedAuth as UserConnectionAuthorization["encryptedAuth"]

      await expect(
        encryptUtils.decryptText(
          encrypted,
          userConnectionAuthorizationAad("another-user", "messenger"),
        ),
      ).rejects.toThrow()
      await expect(
        encryptUtils.decryptText(
          encrypted,
          userConnectionAuthorizationAad(userId, "instagram"),
        ),
      ).rejects.toThrow()
      await expect(
        encryptUtils.decryptText(
          encrypted,
          userConnectionAuthorizationAad(userId, "messenger"),
        ),
      ).resolves.toBe(JSON.stringify({ accessToken: "t" }))
    })
  },
)
