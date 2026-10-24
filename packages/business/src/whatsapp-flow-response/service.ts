import { db } from "@chatbotx.io/database/client"
import { whatsappFlowRepository } from "@chatbotx.io/database/repositories"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import type { WhatsappFlowFieldMapping } from "@chatbotx.io/flow-config"
import { contactActivityService } from "../contact-activity/service"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { logger } from "../logger"

type ApplyWhatsappFlowResponseInput = {
  workspaceId: string
  contactId: string
  contactInbox?: ContactInboxModel
  integrationWhatsappId?: string | null
  flowSourceId: string
  fieldMappings: WhatsappFlowFieldMapping[]
  flowResponse: Record<string, unknown>
}

class WhatsappFlowResponseService {
  async applyResponse(input: ApplyWhatsappFlowResponseInput): Promise<void> {
    const integrationWhatsappId =
      input.integrationWhatsappId ??
      (input.contactInbox
        ? await this.resolveIntegrationWhatsappId(input.contactInbox)
        : null)

    if (!integrationWhatsappId) {
      logger.warn(
        { inboxId: input.contactInbox?.inboxId },
        "IntegrationWhatsapp not found while applying WhatsApp flow response",
      )
      return
    }

    await Promise.all([
      this.recordCompletion({ ...input, integrationWhatsappId }),
      this.applyFieldMappings(input),
    ])
  }

  /**
   * Counts the completion and records the contact's "completed this form"
   * activity in one transaction, so a failure between the two cannot leave one
   * without the other. The count is per submission, as before; the activity
   * (keyed by the flow's internal id) is idempotent per contact.
   */
  private async recordCompletion(
    input: ApplyWhatsappFlowResponseInput & { integrationWhatsappId: string },
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const whatsappFlowId =
        await whatsappFlowRepository.incrementCompletedCount(
          {
            integrationWhatsappId: input.integrationWhatsappId,
            sourceId: input.flowSourceId,
          },
          tx,
        )
      if (!whatsappFlowId) {
        return
      }

      await contactActivityService.record({
        entries: [
          {
            activityType: "formCompleted",
            contactId: input.contactId,
            occurredAt: new Date(),
            referenceId: whatsappFlowId,
            referenceType: "whatsappFlow",
          },
        ],
        tx,
        workspaceId: input.workspaceId,
      })
    })
  }

  private async resolveIntegrationWhatsappId(
    contactInbox: ContactInboxModel,
  ): Promise<string | null> {
    const integrationWhatsapp =
      await db.query.integrationWhatsappModel.findFirst({
        where: { inboxId: contactInbox.inboxId },
        columns: { id: true },
      })

    return integrationWhatsapp?.id ?? null
  }

  private async applyFieldMappings(
    input: Pick<
      ApplyWhatsappFlowResponseInput,
      "workspaceId" | "contactId" | "fieldMappings" | "flowResponse"
    >,
  ): Promise<void> {
    const fields = input.fieldMappings.flatMap((mapping) => {
      if (!mapping.customFieldId) {
        return []
      }

      const value = serializeFlowValue(input.flowResponse[mapping.paramKey])
      return value === null
        ? []
        : [{ customFieldId: mapping.customFieldId, value }]
    })

    if (fields.length === 0) {
      return
    }

    await contactCustomFieldService.setValues({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      fields,
    })
  }
}

export const serializeFlowValue = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) {
    return null
  }
  if (typeof raw === "string") {
    return raw
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw)
  }
  try {
    return JSON.stringify(raw)
  } catch {
    return null
  }
}

export const whatsappFlowResponseService = new WhatsappFlowResponseService()
