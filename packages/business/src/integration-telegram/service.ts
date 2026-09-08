import {
  type DatabaseClient,
  db,
  eq,
  findOrFail,
} from "@chatbotx.io/database/client"
import { integrationTelegramModel } from "@chatbotx.io/database/schema"
import type { IntegrationTelegramModel } from "@chatbotx.io/database/types"
import type { SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { connectChannelIntegration } from "../inbox/connect-channel"

export type ConnectTelegramInput = {
  tx: DatabaseClient
  ownerId: string
  workspaceId: string
  botId: string
  botUsername: string
  botToken: string
}

class TelegramIntegrationService extends BaseService {
  findByInboxIdForWorkspace(props: { inboxId: string; workspaceId: string }) {
    return findOrFail({
      table: integrationTelegramModel,
      where: { inboxId: props.inboxId, workspaceId: props.workspaceId },
    })
  }

  findByWorkspaceIdAndId(props: { workspaceId: string; id: string }) {
    return findOrFail({
      table: integrationTelegramModel,
      where: { workspaceId: props.workspaceId, id: props.id },
      message: "Integration Telegram not found",
    })
  }

  listByWorkspaceId(
    where: Partial<Pick<IntegrationTelegramModel, "workspaceId">>,
  ) {
    return db.query.integrationTelegramModel.findMany({
      where,
      orderBy: { createdAt: "asc" },
    })
  }

  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationTelegramModel.findFirst({
      where: { workspaceId },
    })
  }

  /** No auth check — for use by the webhook handler only. */
  findByBotId(botId: string) {
    return db.query.integrationTelegramModel.findFirst({
      where: { botId },
    })
  }

  async connect(input: ConnectTelegramInput) {
    const auth: SecretTextAuthValue = {
      authType: "secretText",
      secretText: input.botToken,
    }
    const integrationId = createId()

    const { wasCreated } = await connectChannelIntegration({
      tx: input.tx,
      ownerId: input.ownerId,
      inboxData: {
        id: createId(),
        workspaceId: input.workspaceId,
        name: input.botUsername,
        channel: "telegram",
        sourceId: input.botId,
      },
      insertIntegration: async (inboxId) => {
        await input.tx.insert(integrationTelegramModel).values({
          id: integrationId,
          inboxId,
          workspaceId: input.workspaceId,
          botId: input.botId,
          name: input.botUsername,
          auth,
        })
      },
    })

    return { integrationId, wasCreated }
  }

  async disconnect(props: {
    workspaceId: string
    id: string
    tx: DatabaseClient
  }) {
    await props.tx
      .delete(integrationTelegramModel)
      .where(eq(integrationTelegramModel.id, props.id))
  }
}

export const telegramIntegrationService = new TelegramIntegrationService()
