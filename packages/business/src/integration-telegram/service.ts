import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq, findOrFail, gt, sql } from "@chatbotx.io/database/client"
import { inboxStatuses, integrationTypes } from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import {
  inboxModel,
  integrationTelegramModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationTelegramModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import {
  CONNECTION_STORE_BINDINGS,
  type ConnectionQuotaConsumption,
  upsertConnectionRow,
  withQuotaCompensation,
} from "../connection"
import { connectionStateService } from "../connection/state-service"
import { inboxService } from "../inbox/service"
import { dispatchStagedInstalls } from "../template/installation-dispatch"
import { type WorkspaceQuotaConsumption, workspaceService } from "../workspace"

/** 64 hex chars from Web Crypto (no `node:crypto`: this module is in the Edge-safe barrel). */
const generateWebhookSecretToken = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")

class TelegramIntegrationService extends BaseService {
  findByInboxIdForWorkspace(props: { inboxId: string; workspaceId: string }) {
    return findOrFail({
      table: integrationTelegramModel,
      where: { inboxId: props.inboxId, workspaceId: props.workspaceId },
    })
  }

  findByIdForWorkspace(props: { id: string; workspaceId: string }) {
    return findOrFail({
      table: integrationTelegramModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "Integration Telegram not found",
    })
  }

  async listByWorkspace(
    where: Partial<Pick<IntegrationTelegramModel, "workspaceId">>,
  ): Promise<IntegrationTelegramModel[]> {
    return await db.query.integrationTelegramModel.findMany({
      where,
      orderBy: {
        createdAt: "asc",
      },
    })
  }

  async findByBotId(botId: string): Promise<IntegrationTelegramModel | null> {
    return (
      (await db.query.integrationTelegramModel.findFirst({
        where: { botId },
      })) ?? null
    )
  }

  async connect(input: {
    workspaceId?: string
    ownerId: string
    createdBy: string
    botId: string
    botUsername: string
    botToken: string
    onConnected: (ctx: {
      integrationId: string
      /** Pass as `secret_token` to setWebhook; the webhook checks it. */
      webhookSecretToken: string
    }) => Promise<void>
  }): Promise<{
    workspaceId: string
    createdWorkspace: boolean
    wasCreated: boolean
    integrationId: string
  }> {
    const { createdBy, botId, botUsername, botToken, onConnected } = input
    let { workspaceId } = input

    // Known synchronously (no new workspace is ever created for an
    // already-targeted `workspaceId`), so this stays outside the
    // transaction `withQuotaCompensation` wraps — the owner whose quota the
    // `connect.completed` edge below consumes against must match the
    // `ownerId` `withQuotaCompensation` reads back if that edge needs
    // compensating.
    const createdWorkspace = !workspaceId
    const effectiveOwnerId = createdWorkspace ? createdBy : input.ownerId

    // Telegram echoes this in `X-Telegram-Bot-Api-Secret-Token` on every
    // update, so the webhook can reject forged updates (group activity
    // awards leaderboard points). Rotated on every (re)connect.
    const webhookSecretToken = generateWebhookSecretToken()
    const auth = {
      authType: "secretText" as const,
      secretText: botToken,
      metadata: { botId, webhookSecretToken },
    }
    const quotaConsumption: ConnectionQuotaConsumption = {
      consumed: false,
      workspaceUsageIncremented: false,
    }

    const workspaceQuotaConsumption: WorkspaceQuotaConsumption = {
      consumed: false,
    }
    const result = await withQuotaCompensation(
      {
        ownerId: effectiveOwnerId,
        quotaConsumption,
        workspaceQuotaConsumption,
        context: { provider: "telegram" },
      },
      () =>
        db.transaction(async (tx) => {
          if (!workspaceId) {
            const workspace = await workspaceService.create({
              tx,
              createdBy,
              data: {
                name: botUsername,
                timezone: "UTC",
                ownerId: createdBy,
              },
              quotaConsumption: workspaceQuotaConsumption,
            })
            workspaceId = workspace.id
          }

          // The revive-or-insert lookup key `saveOrInsertSatellite` needs —
          // present means a `Connection` row for this (workspace, botId)
          // already exists (even disconnected), so this is a revive rather
          // than a genuine first-ever connect (`wasCreated` below).
          const existing = await connectionRepository.findByProviderSourceId(
            { workspaceId, provider: "telegram", sourceId: botId },
            tx,
          )

          const { inbox } = await inboxService.create({
            tx,
            ownerId: effectiveOwnerId,
            data: {
              workspaceId,
              name: botUsername,
              channel: integrationTypes.enum.telegram,
              sourceId: botId,
            },
            skipQuota: true,
          })

          await upsertConnectionRow({
            tx,
            workspaceId,
            provider: "telegram",
            kind: "channel",
            descriptor: { sourceId: botId, displayName: botUsername },
            auth,
            extraConfig: {},
            existing,
            store: CONNECTION_STORE_BINDINGS.telegram as NonNullable<
              (typeof CONNECTION_STORE_BINDINGS)["telegram"]
            >,
            ownerId: effectiveOwnerId,
            quotaConsumption,
            inboxId: inbox.id,
          })

          const integration = await tx.query.integrationTelegramModel.findFirst(
            { where: { inboxId: inbox.id } },
          )
          if (!integration) {
            throw new Error(
              `telegramIntegrationService.connect: IntegrationTelegram row missing for inbox ${inbox.id}`,
            )
          }

          await onConnected({
            integrationId: integration.id,
            webhookSecretToken,
          })

          return {
            workspaceId,
            wasCreated: !existing,
            integrationId: integration.id,
          }
        }),
    )

    if (createdWorkspace) {
      await dispatchStagedInstalls(result.workspaceId)
    }

    return { ...result, createdWorkspace }
  }

  /** A fresh secret for `setWebhook`'s `secret_token`. */
  createWebhookSecretToken(): string {
    return generateWebhookSecretToken()
  }

  /**
   * Connected bots in bounded keyset pages (ascending id, strictly after
   * `afterId`), for re-registering their webhooks.
   *
   * Ops-only and cross-tenant (every workspace, bot tokens included): called
   * by `apps/worker/scripts/reregister-telegram-webhooks.ts`. Never call it
   * from a request path.
   */
  listConnectedForWebhookRefresh(input: { afterId?: string; limit: number }) {
    return db
      .select({
        id: integrationTelegramModel.id,
        workspaceId: integrationTelegramModel.workspaceId,
        botId: integrationTelegramModel.botId,
        auth: integrationTelegramModel.auth,
      })
      .from(integrationTelegramModel)
      .innerJoin(
        inboxModel,
        eq(inboxModel.id, integrationTelegramModel.inboxId),
      )
      .where(
        and(
          eq(inboxModel.status, inboxStatuses.enum.connected),
          input.afterId
            ? gt(integrationTelegramModel.id, input.afterId)
            : undefined,
        ),
      )
      .orderBy(integrationTelegramModel.id)
      .limit(input.limit)
  }

  /**
   * Stores a webhook secret on a bot that has none, leaving the bot token and
   * the rest of `auth` untouched. Returns false when the bot already has a
   * secret by now (e.g. it was reconnected meanwhile) — the stored one wins.
   *
   * Ops-only: updates by primary key with no workspace scope, for the same
   * re-register script. Never call it from a request path.
   */
  async saveMissingWebhookSecretToken(input: {
    id: string
    webhookSecretToken: string
  }): Promise<boolean> {
    const rows = await db
      .update(integrationTelegramModel)
      .set({
        auth: sql`jsonb_set(${integrationTelegramModel.auth}, '{metadata}', coalesce(${integrationTelegramModel.auth}->'metadata', '{}'::jsonb) || jsonb_build_object('webhookSecretToken', ${input.webhookSecretToken}::text))`,
      })
      .where(
        and(
          eq(integrationTelegramModel.id, input.id),
          sql`${integrationTelegramModel.auth}->'metadata'->>'webhookSecretToken' is null`,
        ),
      )
      .returning({ id: integrationTelegramModel.id })
    return rows.length > 0
  }

  async disconnect(input: {
    workspaceId: string
    id: string
    inboxId: string
    ownerId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, id, inboxId, ownerId, tx } = input

    const run = async (client: DatabaseClient) => {
      await client
        .delete(integrationTelegramModel)
        .where(
          and(
            eq(integrationTelegramModel.id, id),
            eq(integrationTelegramModel.workspaceId, workspaceId),
          ),
        )
      await connectionStateService.disconnectInbox({
        inboxId,
        workspaceId,
        ownerId,
        tx: client,
      })
    }

    if (tx) {
      await run(tx)
      return
    }
    await db.transaction(run)
  }
}

export const telegramIntegrationService = new TelegramIntegrationService()
