import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  db,
  eq,
  findOrFail,
  isDatabaseError,
} from "@chatbotx.io/database/client"
import { integrationTypes } from "@chatbotx.io/database/partials"
import { integrationTelegramModel } from "@chatbotx.io/database/schema"
import type { IntegrationTelegramModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
import { connectChannelIntegration } from "../inbox/connect-channel"
import { inboxService } from "../inbox/service"
import { workspaceService } from "../workspace"

const UNIQUE_VIOLATION_CODE = "23505"

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
    const { ownerId, createdBy, botId, botUsername, botToken, onConnected } =
      input
    let { workspaceId } = input

    try {
      return await db.transaction(async (tx) => {
        const auth = {
          authType: "secretText" as const,
          secretText: botToken,
        }
        let createdWorkspace = false
        let effectiveOwnerId = ownerId

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
          effectiveOwnerId = createdBy
          createdWorkspace = true
        }

        const integrationId = createId()
        const { wasCreated } = await connectChannelIntegration({
          tx,
          ownerId: effectiveOwnerId,
          inboxData: {
            id: createId(),
            workspaceId,
            name: botUsername,
            channel: integrationTypes.enum.telegram,
            sourceId: botId,
          },
          insertIntegration: async (inboxId) => {
            await tx.insert(integrationTelegramModel).values({
              id: integrationId,
              inboxId,
              workspaceId: workspaceId as string,
              botId,
              name: botUsername,
              auth,
            })
          },
        })

        await onConnected({ integrationId })

        return {
          workspaceId,
          createdWorkspace,
          wasCreated,
          integrationId,
        }
      })
    } catch (error) {
      if (
        isDatabaseError(error) &&
        error.cause.code === UNIQUE_VIOLATION_CODE
      ) {
        throw new ChatbotXException("Bot already connected")
      }
      throw error
    }
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
        .where(eq(integrationTelegramModel.id, id))
      await inboxService.disconnect({
        inboxId,
        ownerId,
        workspaceId,
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
