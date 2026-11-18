// @vitest-environment node

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import {
  type ConnectionAuthorizationCrypto,
  rotateConnectionAuthorizations,
} from "../../scripts/rotate-connection-authorizations"
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

const OLD_KID = "rotation-test-old"
const NEW_KID = "rotation-test-new"
const OLDER = "2026-11-18T10:00:00.000Z"
const NEWER = "2026-11-18T10:00:05.000Z"

type FakeBlob = UserConnectionAuthorization["encryptedAuth"]

// Reversible stand-in for the real cipher: it records the kid and AAD so the
// test can assert both, and rejects blobs that were not written by this test.
const fakeBlob = (kid: string, auth: unknown, aad: string): FakeBlob => ({
  v: 1,
  kid,
  iv: "00",
  text: JSON.stringify(auth),
  tag: "00",
  aad,
})

const fakeCrypto: ConnectionAuthorizationCrypto = {
  decrypt: async (blob, aad) => {
    if (blob.kid !== OLD_KID || blob.aad !== aad) {
      throw new Error("not a rotation-test blob")
    }
    return await Promise.resolve(JSON.parse(blob.text))
  },
  encrypt: async (auth, aad) =>
    await Promise.resolve(fakeBlob(NEW_KID, auth, aad)),
}

describe.skipIf(!databaseUrl)(
  "rotateConnectionAuthorizations against Postgres",
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
          email: `connection-authorization-rotation-${Date.now()}-${Math.random()}@example.test`,
        })
        .returning({ id: schema.userModel.id })
      createdUserIds.push(user.id)
      return user.id
    }

    const entryFor = (input: {
      userId: string
      provider: IntegrationType
      kid: string
      capturedAt: string
      token: string
    }): UserConnectionAuthorization => ({
      encryptedAuth: fakeBlob(
        input.kid,
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

    const seedEntry = async (
      input: Parameters<typeof entryFor>[0],
    ): Promise<void> => {
      await userRepository.recordConnectionAuthorization(
        {
          userId: input.userId,
          provider: input.provider,
          entry: entryFor(input),
        },
        db,
      )
    }

    const readEntries = async (userId: string) => {
      const row = await db.query.userModel.findFirst({
        where: { id: userId },
        columns: { connectionAuthorizations: true, updatedAt: true },
      })
      if (!row) {
        throw new Error("seeded user missing")
      }
      return row
    }

    const rotate = async (batchSize?: number) =>
      await rotateConnectionAuthorizations({
        activeKid: NEW_KID,
        dryRun: false,
        crypto: fakeCrypto,
        batchSize,
        tx: db,
      })

    test("re-encrypts every provider entry with the user and provider AAD", async () => {
      const userId = await seedUser()
      await seedEntry({
        userId,
        provider: "messenger",
        kid: OLD_KID,
        capturedAt: OLDER,
        token: "m",
      })
      await seedEntry({
        userId,
        provider: "instagram",
        kid: OLD_KID,
        capturedAt: OLDER,
        token: "i",
      })
      const before = await readEntries(userId)

      const result = await rotate()

      expect(result.rotated).toBeGreaterThanOrEqual(2)
      const after = await readEntries(userId)
      for (const provider of ["messenger", "instagram"] as const) {
        const entry = after.connectionAuthorizations?.[provider]
        expect(entry?.encryptedAuth.kid).toBe(NEW_KID)
        expect(entry?.encryptedAuth.aad).toBe(
          userConnectionAuthorizationAad(userId, provider),
        )
        expect(entry?.capturedAt).toBe(OLDER)
        expect(entry?.phase).toBe("authorizationObtained")
      }
      expect(after.updatedAt).toEqual(before.updatedAt)
    })

    test("is idempotent and keeps paging past the batch size", async () => {
      const userIds = [await seedUser(), await seedUser(), await seedUser()]
      for (const userId of userIds) {
        await seedEntry({
          userId,
          provider: "messenger",
          kid: OLD_KID,
          capturedAt: OLDER,
          token: userId,
        })
      }

      await rotate(1)
      const second = await rotate(1)

      for (const userId of userIds) {
        expect(
          (await readEntries(userId)).connectionAuthorizations?.messenger
            ?.encryptedAuth.kid,
        ).toBe(NEW_KID)
      }
      expect(second.rotated).toBe(0)
    })

    test("a dry run writes nothing", async () => {
      const userId = await seedUser()
      await seedEntry({
        userId,
        provider: "messenger",
        kid: OLD_KID,
        capturedAt: OLDER,
        token: "m",
      })

      const result = await rotateConnectionAuthorizations({
        activeKid: NEW_KID,
        dryRun: true,
        crypto: fakeCrypto,
        tx: db,
      })

      expect(result.toRotate).toBeGreaterThanOrEqual(1)
      expect(
        (await readEntries(userId)).connectionAuthorizations?.messenger
          ?.encryptedAuth.kid,
      ).toBe(OLD_KID)
    })

    test("does not overwrite an entry written while rotation was running", async () => {
      const userId = await seedUser()
      await seedEntry({
        userId,
        provider: "messenger",
        kid: OLD_KID,
        capturedAt: OLDER,
        token: "stale",
      })

      const result = await rotateConnectionAuthorizations({
        activeKid: NEW_KID,
        dryRun: false,
        tx: db,
        crypto: {
          decrypt: fakeCrypto.decrypt,
          // A live connect lands between the read and the replacement.
          encrypt: async (auth, aad) => {
            await seedEntry({
              userId,
              provider: "messenger",
              kid: "live-write",
              capturedAt: NEWER,
              token: "live",
            })
            return await fakeCrypto.encrypt(auth, aad)
          },
        },
      })

      expect(result.skippedChanged).toBeGreaterThanOrEqual(1)
      const stored = (await readEntries(userId)).connectionAuthorizations
        ?.messenger
      expect(stored?.capturedAt).toBe(NEWER)
      expect(stored?.encryptedAuth.kid).toBe("live-write")
    })

    test("counts an undecryptable entry as an error and leaves it unchanged", async () => {
      const userId = await seedUser()
      await seedEntry({
        userId,
        provider: "messenger",
        kid: "unknown-kid",
        capturedAt: OLDER,
        token: "m",
      })

      const result = await rotate()

      expect(result.errors).toBeGreaterThanOrEqual(1)
      expect(
        (await readEntries(userId)).connectionAuthorizations?.messenger
          ?.encryptedAuth.kid,
      ).toBe("unknown-kid")
    })
  },
)
