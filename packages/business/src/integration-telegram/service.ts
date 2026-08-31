import { findOrFail } from "@chatbotx.io/database/client"
import { integrationTelegramModel } from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"

class TelegramIntegrationService extends BaseService {
  findByInboxIdForWorkspace(props: { inboxId: string; workspaceId: string }) {
    return findOrFail({
      table: integrationTelegramModel,
      where: { inboxId: props.inboxId, workspaceId: props.workspaceId },
    })
  }
}

export const telegramIntegrationService = new TelegramIntegrationService()
