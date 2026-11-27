// @vitest-environment node

/**
 * Real-Postgres coverage for `lineIntegrationService.connect`/`.disconnect`:
 * inbox + `IntegrationLine` + `Connection` rows, the cross-workspace
 * `channelDuplicated` guard (D3) and the disconnect → reconnect revive (D15),
 * plus `findDueForRefresh`'s work list (revoked and malformed-expiry rows).
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run with
 * `pnpm --filter @chatbotx.io/business test:db integration-line-service`.
 */

import { db } from "@chatbotx.io/database/client"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import {
  integrationLineModel,
  userModel,
  userQuotaModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { eq } from "drizzle-orm"
import { describe, expect, test } from "vitest"
import { lineIntegrationService } from "../../src/integration-line/service"

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

const seedWorkspace = async (): Promise<{
  ownerId: string
  workspaceId: string
}> => {
  const ownerId = createId()
  const workspaceId = createId()
  await db.insert(userModel).values({
    id: ownerId,
    email: `line-connect-${ownerId}@example.test`,
    name: "LINE connect test owner",
  })
  await db.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "LINE connect test workspace",
  })
  await db.insert(userQuotaModel).values({
    userId: ownerId,
    planName: "LINE connect test plan",
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

const cleanup = async (input: {
  ownerId: string
  workspaceId: string
}): Promise<void> => {
  await db
    .delete(workspaceModel)
    .where(eq(workspaceModel.id, input.workspaceId))
  await db.delete(userModel).where(eq(userModel.id, input.ownerId))
}

const connectInput = (props: {
  workspaceId: string
  ownerId: string
  channelId: string
  botUserId: string
}) => ({
  workspaceId: props.workspaceId,
  ownerId: props.ownerId,
  createdBy: props.ownerId,
  channelId: props.channelId,
  auth: {
    authType: "oauth2" as const,
    clientId: props.channelId,
    clientSecret: "channel-secret",
    redirectUrl: "",
    tokens: {
      accessToken: "access-token",
      expiresAt: "2027-01-01T00:00:00.000Z",
    },
    metadata: { botUserId: props.botUserId, basicId: "@line-basic" },
  },
  bot: {
    userId: props.botUserId,
    basicId: "@line-basic",
    displayName: "LINE Test OA",
    pictureUrl: "https://example.test/pic.png",
  },
  onConnected: async () => undefined,
})

describe.skipIf(!databaseUrl)(
  "lineIntegrationService.connect/.disconnect against Postgres",
  () => {
    test("connect() creates the LINE inbox, IntegrationLine row and Connection", async () => {
      const seed = await seedWorkspace()
      try {
        const channelId = createId()
        const botUserId = `U${createId()}`
        const result = await lineIntegrationService.connect(
          connectInput({ ...seed, channelId, botUserId }),
        )

        expect(result).toMatchObject({
          workspaceId: seed.workspaceId,
          createdWorkspace: false,
          wasCreated: true,
        })

        const row = await lineIntegrationService.findByChannelId(channelId)
        expect(row).toMatchObject({
          id: result.integrationId,
          inboxId: result.inboxId,
          workspaceId: seed.workspaceId,
          channelId,
          botUserId,
          basicId: "@line-basic",
          name: "LINE Test OA",
          pictureUrl: "https://example.test/pic.png",
        })

        const inbox = await db.query.inboxModel.findFirst({
          where: { id: result.inboxId },
        })
        expect(inbox).toMatchObject({
          channel: "line",
          sourceId: channelId,
          name: "LINE Test OA",
        })

        const connection = await connectionRepository.findByProviderSourceId({
          workspaceId: seed.workspaceId,
          provider: "line",
          sourceId: channelId,
        })
        expect(connection).toMatchObject({
          status: "connected",
          inboxId: result.inboxId,
        })
      } finally {
        await cleanup(seed)
      }
    })

    test("connecting the same channelId in another workspace throws channelDuplicated", async () => {
      const first = await seedWorkspace()
      const second = await seedWorkspace()
      try {
        const channelId = createId()
        const botUserId = `U${createId()}`
        await lineIntegrationService.connect(
          connectInput({ ...first, channelId, botUserId }),
        )

        await expect(
          lineIntegrationService.connect(
            connectInput({ ...second, channelId, botUserId }),
          ),
        ).rejects.toMatchObject({ code: "channelDuplicated" })
      } finally {
        await cleanup(first)
        await cleanup(second)
      }
    })

    test("disconnect then reconnect in the same workspace revives the inbox", async () => {
      const seed = await seedWorkspace()
      try {
        const channelId = createId()
        const botUserId = `U${createId()}`
        const first = await lineIntegrationService.connect(
          connectInput({ ...seed, channelId, botUserId }),
        )

        await lineIntegrationService.disconnect({
          workspaceId: seed.workspaceId,
          id: first.integrationId,
          inboxId: first.inboxId,
          ownerId: seed.ownerId,
        })
        expect(
          await lineIntegrationService.findByChannelId(channelId),
        ).toBeNull()

        const second = await lineIntegrationService.connect(
          connectInput({ ...seed, channelId, botUserId }),
        )
        expect(second.inboxId).toBe(first.inboxId)
        expect(second.wasCreated).toBe(false)

        const connection = await connectionRepository.findByProviderSourceId({
          workspaceId: seed.workspaceId,
          provider: "line",
          sourceId: channelId,
        })
        expect(connection?.status).toBe("connected")
      } finally {
        await cleanup(seed)
      }
    })
  },
)

describe.skipIf(!databaseUrl)(
  "lineIntegrationService.findDueForRefresh against Postgres",
  () => {
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

    const connectWithExpiry = async (
      seed: { workspaceId: string; ownerId: string },
      expiresAt: string,
    ): Promise<string> => {
      const channelId = createId()
      const input = connectInput({
        ...seed,
        channelId,
        botUserId: `U${createId()}`,
      })
      const { integrationId } = await lineIntegrationService.connect(input)
      await db
        .update(integrationLineModel)
        .set({
          auth: { ...input.auth, tokens: { ...input.auth.tokens, expiresAt } },
        })
        .where(eq(integrationLineModel.id, integrationId))
      return integrationId
    }

    test("lists due and unreadable expiries, skips fresh and revoked channels", async () => {
      const seed = await seedWorkspace()
      try {
        const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        const due = await connectWithExpiry(seed, soon)
        const fresh = await connectWithExpiry(seed, "2099-01-01T00:00:00.000Z")
        const malformed = await connectWithExpiry(seed, "not-a-date")
        const revoked = await connectWithExpiry(seed, soon)
        await lineIntegrationService.markTokenRefreshError({
          id: revoked,
          workspaceId: seed.workspaceId,
          error: "invalid client secret",
          isRevoked: true,
        })

        const ids = (
          await lineIntegrationService.findDueForRefresh(THREE_DAYS_MS)
        ).map((row) => row.id)

        expect(ids).toContain(due)
        expect(ids).toContain(malformed)
        expect(ids).not.toContain(fresh)
        expect(ids).not.toContain(revoked)
      } finally {
        await cleanup(seed)
      }
    })

    test("a transient refresh failure keeps the channel on the work list", async () => {
      const seed = await seedWorkspace()
      try {
        const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        const degraded = await connectWithExpiry(seed, soon)
        await lineIntegrationService.markTokenRefreshError({
          id: degraded,
          workspaceId: seed.workspaceId,
          error: "LINE 503",
          isRevoked: false,
        })

        const ids = (
          await lineIntegrationService.findDueForRefresh(THREE_DAYS_MS)
        ).map((row) => row.id)

        expect(ids).toContain(degraded)
      } finally {
        await cleanup(seed)
      }
    })
  },
)
