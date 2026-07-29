import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
import { externalWebhookModel } from "@chatbotx.io/database/schema"
import type { ExternalWebhookModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { assertPublicUrl } from "../net/ssrf-guard"

const MAX_WEBHOOKS_PER_WORKSPACE = 50

class ExternalWebhookService extends BaseService {
  /**
   * Registers a webhook URL for an event. Idempotent: attaching the same
   * (workspaceId, event, url) again returns the existing row instead of
   * erroring, since the external platform (e.g. Make) may retry attach calls.
   */
  async register(props: {
    workspaceId: string
    provider: string
    event: string
    url: string
  }): Promise<ExternalWebhookModel> {
    const { workspaceId, provider, event, url } = props

    try {
      await assertPublicUrl(url, "Webhook URL")
    } catch (error) {
      throw new ChatbotXException(
        error instanceof Error ? error.message : "Invalid webhook URL",
        "invalidRequestData",
        422,
      )
    }

    const existing = await db.query.externalWebhookModel.findFirst({
      where: { workspaceId, event, url },
    })
    if (existing) {
      return existing
    }

    const count = await db.$count(
      externalWebhookModel,
      eq(externalWebhookModel.workspaceId, workspaceId),
    )
    if (count >= MAX_WEBHOOKS_PER_WORKSPACE) {
      throw new ChatbotXException(
        `Workspace has reached the maximum of ${MAX_WEBHOOKS_PER_WORKSPACE} external webhooks`,
        "externalWebhookLimitReached",
      )
    }

    const [created] = await db
      .insert(externalWebhookModel)
      .values({ id: createId(), workspaceId, provider, event, url })
      .onConflictDoNothing()
      .returning()

    if (created) {
      return created
    }

    // Lost a race with a concurrent attach for the same (workspaceId, event, url).
    return await findOrFail({
      table: externalWebhookModel,
      where: { workspaceId, event, url },
    })
  }

  async unregister(props: { workspaceId: string; id: string }): Promise<void> {
    const { workspaceId, id } = props

    const deleted = await db
      .delete(externalWebhookModel)
      .where(
        and(
          eq(externalWebhookModel.id, id),
          eq(externalWebhookModel.workspaceId, workspaceId),
        ),
      )
      .returning({ id: externalWebhookModel.id })

    if (deleted.length === 0) {
      throw notFoundException("External webhook not found")
    }
  }

  async listByWorkspaceAndEvents(props: {
    workspaceId: string
    events: string[]
  }): Promise<ExternalWebhookModel[]> {
    const { workspaceId, events } = props
    if (events.length === 0) {
      return []
    }

    return await db.query.externalWebhookModel.findMany({
      where: { workspaceId, event: { in: events } },
    })
  }

  async listByWorkspaceId(
    workspaceId: string,
  ): Promise<ExternalWebhookModel[]> {
    return await db.query.externalWebhookModel.findMany({
      where: { workspaceId },
    })
  }
}

export const externalWebhookService = new ExternalWebhookService()
