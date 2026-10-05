import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationTypes } from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import { integrationTelegramModel } from "@chatbotx.io/database/schema"
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
import { workspaceService } from "../workspace"

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
    onConnected: (ctx: { integrationId: string }) => Promise<void>
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

    const auth = {
      authType: "secretText" as const,
      secretText: botToken,
    }
    const quotaConsumption: ConnectionQuotaConsumption = {
      consumed: false,
      workspaceUsageIncremented: false,
    }

    const result = await withQuotaCompensation(
      {
        ownerId: effectiveOwnerId,
        quotaConsumption,
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

          await onConnected({ integrationId: integration.id })

          return {
            workspaceId,
            wasCreated: !existing,
            integrationId: integration.id,
          }
        }),
    )

    return { ...result, createdWorkspace }
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
