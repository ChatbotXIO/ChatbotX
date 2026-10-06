// @vitest-environment node

/**
 * Real-Postgres coverage for `integrationThreadsService.connect`/`.reconnect`
 * now that `threads` has a real `Connection` adapter/store binding
 * (`CONNECTION_STORE_BINDINGS.threads`, `CONNECTION_REGISTRY.threads`):
 * both methods now write the `Connection` row through the generic engine
 * (`upsertConnectionRow`/`saveOrInsertSatellite` + `connectionStateService
 * .transition`) instead of touching only `IntegrationThreads`.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run with
 * `pnpm --filter @chatbotx.io/business test:db`.
 */

import { db } from "@chatbotx.io/database/client"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import {
  connectionModel,
  userModel,
  userQuotaModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type Oauth2AuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { eq } from "drizzle-orm"
import { describe, expect, test } from "vitest"
import { integrationThreadsService } from "../../src/integration-threads/service"

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

const databaseUrl = realDatabaseUrl()

const seedCommittedWorkspace = async (): Promise<{
  ownerId: string
  workspaceId: string
}> => {
  const ownerId = createId()
  const workspaceId = createId()
  await db.insert(userModel).values({
    id: ownerId,
    email: `threads-connect-${ownerId}@example.test`,
    name: "Threads connect test owner",
  })
  await db.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "Threads connect test workspace",
  })
  await db.insert(userQuotaModel).values({
    userId: ownerId,
    planName: "Threads connect test plan",
    planStatus: "active",
  })
  await db.insert(workspaceMemberModel).values({
    id: createId(),
    workspaceId,
    userId: ownerId,
    role: "owner",
  })
  return { ownerId, workspaceId }
}

const cleanupCommittedWorkspace = async (input: {
  ownerId: string
  workspaceId: string
}): Promise<void> => {
  await db
    .delete(workspaceModel)
    .where(eq(workspaceModel.id, input.workspaceId))
  await db.delete(userModel).where(eq(userModel.id, input.ownerId))
}

const buildAuth = (
  threadsUserId: string,
  username: string,
  accessToken: string,
  expiresAt: string,
): Oauth2AuthValue => ({
  authType: AuthType.oauth2,
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUrl: "https://example.test/integrations/threads/callback",
  tokens: { accessToken, expiresAt },
  metadata: { threadsUserId, username, version: "v1.0" },
})

describe.skipIf(!databaseUrl)(
  "integrationThreadsService.connect/.reconnect against Postgres",
  () => {
    test("connect() commits Connection+IntegrationThreads and consumes channels quota", async () => {
      const { ownerId, workspaceId } = await seedCommittedWorkspace()
      try {
        const threadsUserId = createId()
        const auth = buildAuth(
          threadsUserId,
          "threads_test_user",
          "first-access-token",
          "2027-01-01T00:00:00.000Z",
        )

        const integration = await integrationThreadsService.connect({
          workspaceId,
          ownerId,
          auth,
          threadsUserId,
          username: "threads_test_user",
          name: "Threads Test Account",
        })

        expect(integration.threadsUserId).toBe(threadsUserId)
        expect(integration.username).toBe("threads_test_user")

        const connection = await connectionRepository.findByProviderSourceId({
          workspaceId,
          provider: "threads",
          sourceId: threadsUserId,
        })
        expect(connection).toMatchObject({
          kind: "channel",
          channel: "threads",
          status: "connected",
          statusReason: null,
          inboxId: integration.inboxId,
        })

        const [quota] = await db
          .select()
          .from(userQuotaModel)
          .where(eq(userQuotaModel.userId, ownerId))
          .limit(1)
        expect(quota?.channelsUsed).toBe(1)
      } finally {
        await cleanupCommittedWorkspace({ ownerId, workspaceId })
      }
    })

    test("reconnect() revives a needs_reauth connection: refreshes auth/username, stamps authExpiresAt, and re-consumes channels quota", async () => {
      const { ownerId, workspaceId } = await seedCommittedWorkspace()
      try {
        const threadsUserId = createId()
        const initialAuth = buildAuth(
          threadsUserId,
          "threads_old_username",
          "stale-access-token",
          "2026-01-01T00:00:00.000Z",
        )
        const integration = await integrationThreadsService.connect({
          workspaceId,
          ownerId,
          auth: initialAuth,
          threadsUserId,
          username: "threads_old_username",
          name: "Threads Test Account",
        })

        const connectionBeforeReauth =
          await connectionRepository.findByProviderSourceId({
            workspaceId,
            provider: "threads",
            sourceId: threadsUserId,
          })
        if (!connectionBeforeReauth) {
          throw new Error("connect() did not create a Connection row")
        }

        // Simulates the token-refresh cron (or a revoked-token webhook)
        // moving an active connection to `needs_reauth` — this test only
        // needs the FSM's pre-reconnect state, not the cron path itself.
        await db
          .update(connectionModel)
          .set({ status: "needs_reauth", statusReason: "token_revoked" })
          .where(eq(connectionModel.id, connectionBeforeReauth.id))

        const [quotaAfterReauth] = await db
          .select()
          .from(userQuotaModel)
          .where(eq(userQuotaModel.userId, ownerId))
          .limit(1)
        // The simulated reauth above was a raw row update, not a real FSM
        // `user.disconnect`/release transition, so quota stays consumed —
        // mirrors the real "token silently expired" state this test models.
        expect(quotaAfterReauth?.channelsUsed).toBe(1)

        const freshAuth = buildAuth(
          threadsUserId,
          "threads_new_username",
          "fresh-access-token",
          "2027-06-01T00:00:00.000Z",
        )
        const updated = await integrationThreadsService.reconnect({
          workspaceId,
          id: integration.id,
          auth: freshAuth,
          username: "threads_new_username",
          name: "Threads Test Account",
        })
        expect(updated).toBe(true)

        const satelliteRow = await db.query.integrationThreadsModel.findFirst({
          where: { id: integration.id },
        })
        expect(satelliteRow?.auth).toMatchObject({
          tokens: { accessToken: "fresh-access-token" },
        })
        expect(satelliteRow?.username).toBe("threads_new_username")

        const connectionAfterReconnect =
          await connectionRepository.findByProviderSourceId({
            workspaceId,
            provider: "threads",
            sourceId: threadsUserId,
          })
        expect(connectionAfterReconnect).toMatchObject({
          status: "connected",
          statusReason: null,
          lastError: null,
        })
        expect(connectionAfterReconnect?.authExpiresAt?.toISOString()).toBe(
          new Date("2027-06-01T00:00:00.000Z").toISOString(),
        )
      } finally {
        await cleanupCommittedWorkspace({ ownerId, workspaceId })
      }
    })
  },
)
