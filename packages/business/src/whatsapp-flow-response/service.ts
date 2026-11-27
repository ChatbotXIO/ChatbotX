import { db } from "@chatbotx.io/database/client"
import { whatsappFlowRepository } from "@chatbotx.io/database/repositories"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import type { WhatsappFlowFieldMapping } from "@chatbotx.io/flow-config"
import { SourceTimezoneStrategy } from "@chatbotx.io/utils/datetime"
import type { ResolvedFlowFile } from "@chatbotx.io/worker-config"
import { contactActivityService } from "../contact-activity/service"
import { createSourceTimezoneResolver } from "../contact-custom-field/normalize"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { customFieldService } from "../custom-field/service"
import { logger } from "../logger"
import {
  dependsOnFieldType,
  fitValueToFieldType,
  type MappedValue,
  toMappedValue,
} from "./field-values"

export { serializeFlowValue } from "./field-values"

type ApplyWhatsappFlowResponseInput = {
  workspaceId: string
  contactId: string
  contactInbox?: ContactInboxModel
  integrationWhatsappId?: string | null
  flowSourceId: string
  fieldMappings: WhatsappFlowFieldMapping[]
  flowResponse: Record<string, unknown>
  /**
   * The stored files of the response's file answers, by response key. A key
   * present here is a file answer even with no stored file left, so its raw
   * (provider-side) value is never written to a field.
   */
  flowFiles?: Record<string, ResolvedFlowFile[]>
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
      | "workspaceId"
      | "contactId"
      | "fieldMappings"
      | "flowResponse"
      | "flowFiles"
    >,
  ): Promise<void> {
    const values = input.fieldMappings.flatMap((mapping) => {
      const value = mapping.customFieldId
        ? toMappedValue(mapping, mapping.customFieldId, input)
        : null
      return value ? [value] : []
    })
    const fields = await this.fitValuesToFieldTypes(input, values)
    if (fields.length === 0) {
      return
    }

    await contactCustomFieldService.setValues({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      fields: fields.map(({ customFieldId, value }) => ({
        customFieldId,
        value,
      })),
    })
  }

  /**
   * Fits each value to its field's type, with one lookup for all of them. File
   * links only fit a text field: a mapping to any other type (saved through
   * the API, or before the editor limited the choice) is skipped, so one unfit
   * field never fails the response's other fields. A date answer is put in the
   * shape a date field accepts (`toTemporalFieldValue`).
   */
  private async fitValuesToFieldTypes(
    contact: { workspaceId: string; contactId: string },
    values: MappedValue[],
  ): Promise<MappedValue[]> {
    if (values.length === 0) {
      return values
    }
    const ids = [
      ...new Set(
        values.filter(dependsOnFieldType).map((value) => value.customFieldId),
      ),
    ]
    if (ids.length === 0) {
      return values
    }
    const { workspaceId } = contact
    // Meta: a legacy timestamp "should be converted back to the business's
    // local time zone". Looked up only when one needs it, then memoized.
    const resolveTimezone = createSourceTimezoneResolver({
      ...contact,
      strategy: SourceTimezoneStrategy.Workspace,
    })
    const fieldTypes = new Map(
      (await customFieldService.findManyByIds({ workspaceId, ids })).map(
        (field) => [field.id, field.type] as const,
      ),
    )
    const fitted = await Promise.all(
      values.map((value) =>
        fitValueToFieldType(
          value,
          fieldTypes.get(value.customFieldId),
          resolveTimezone,
        ),
      ),
    )
    return fitted.flatMap((value, index) => {
      if (!value) {
        logger.warn(
          { workspaceId, customFieldId: values[index]?.customFieldId },
          "Skipped WhatsApp Flow file links mapped to a non-text custom field",
        )
      }
      return value ? [value] : []
    })
  }
}

export const whatsappFlowResponseService = new WhatsappFlowResponseService()
