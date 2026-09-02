import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationMailchimpModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { encryptUtils } from "@chatbotx.io/encryption"
import type { AuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

class IntegrationMailchimpService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationMailchimpModel.findFirst({
      where: { workspaceId },
    })
  }

  async findByWorkspaceIdOrFail(workspaceId: string) {
    const integration = await this.findByWorkspaceId(workspaceId)
    if (!integration) {
      throw new Error("Mailchimp integration not found")
    }
    return integration
  }

  async upsert(props: { workspaceId: string; auth: AuthValue }) {
    const encryptedAuth = await encryptUtils.encryptObject(props.auth)
    const existing = await this.findByWorkspaceId(props.workspaceId)

    if (existing) {
      await db
        .update(integrationMailchimpModel)
        .set({ auth: encryptedAuth })
        .where(eq(integrationMailchimpModel.id, existing.id))
      await this.audit(
        "update",
        "updated the Mailchimp integration configuration",
      )
      return existing.id
    }

    const integrationId = createId()
    const mailchimpId = createId()
    await db.transaction(async (tx) => {
      await tx.insert(integrationModel).values({
        id: integrationId,
        workspaceId: props.workspaceId,
        integrationType: "mailchimp",
      })
      await tx.insert(integrationMailchimpModel).values({
        id: mailchimpId,
        workspaceId: props.workspaceId,
        integrationId,
        auth: encryptedAuth,
      })
    })
    await this.audit("connect", "connected a new Mailchimp integration")
    return mailchimpId
  }

  async disconnect(workspaceId: string) {
    const existing = await this.findByWorkspaceId(workspaceId)
    if (!existing) {
      return
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(integrationMailchimpModel)
        .where(eq(integrationMailchimpModel.id, existing.id))
      await tx
        .delete(integrationModel)
        .where(eq(integrationModel.id, existing.integrationId))
    })

    await this.audit("disconnect", "disconnected the Mailchimp integration")
  }
}

export const integrationMailchimpService = new IntegrationMailchimpService()
