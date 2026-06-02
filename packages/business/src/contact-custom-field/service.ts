import { and, type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { contactCustomFieldModel } from "@chatbotx.io/database/schema"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import { createId, isNumericId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

type SetValuesInput = {
  workspaceId: string
  contactId: string
  fields: Array<{ customFieldId: string; value: string }>
}

type DeleteByKeyInput = {
  workspaceId: string
  contactId: string
  keyword: string
}

class ContactCustomFieldService extends BaseService {
  async setValues(
    input: SetValuesInput,
    tx: DatabaseClient = db,
  ): Promise<void> {
    const { workspaceId, contactId, fields } = input
    const customFieldIds = fields.map((f) => f.customFieldId)

    const customFields = await tx.query.customFieldModel.findMany({
      where: { workspaceId, id: { in: customFieldIds } },
      columns: { id: true, name: true },
    })

    if (customFields.length === 0) {
      return
    }

    const existingValues = await tx.query.contactCustomFieldModel.findMany({
      where: { contactId, customFieldId: { in: customFieldIds } },
    })

    await tx.transaction(async (innerTx) => {
      const matchedFields = customFields.flatMap((customField) => {
        const field = fields.find((f) => f.customFieldId === customField.id)
        return field ? [{ customField, field }] : []
      })

      await Promise.all(
        matchedFields.map(({ customField, field }) => {
          const existing = existingValues.find(
            (v) => v.customFieldId === customField.id,
          )
          if (existing) {
            return innerTx
              .update(contactCustomFieldModel)
              .set({ value: field.value })
              .where(eq(contactCustomFieldModel.id, existing.id))
          }
          return innerTx.insert(contactCustomFieldModel).values({
            id: createId(),
            contactId,
            customFieldId: customField.id,
            value: field.value,
          })
        }),
      )
    })

    for (const customField of customFields) {
      const field = fields.find((f) => f.customFieldId === customField.id)
      if (!field) {
        continue
      }
      emitCustomFieldChanged(
        workspaceId,
        contactId,
        customField.id,
        customField.name,
        null,
        field.value,
        // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
      ).catch(() => {})
    }

    await this.invalidate({ workspaceId, contactId })
  }

  async deleteByKey(input: DeleteByKeyInput): Promise<void> {
    const { workspaceId, contactId, keyword } = input

    let customField: { id: string } | undefined

    if (isNumericId(keyword)) {
      customField = await db.query.customFieldModel.findFirst({
        where: { id: keyword, workspaceId },
        columns: { id: true },
      })
    }

    if (!customField) {
      customField = await db.query.customFieldModel.findFirst({
        where: { name: keyword, workspaceId },
        columns: { id: true },
      })
    }

    if (!customField) {
      throw notFoundException("Custom field not found")
    }

    await db
      .delete(contactCustomFieldModel)
      .where(
        and(
          eq(contactCustomFieldModel.contactId, contactId),
          eq(contactCustomFieldModel.customFieldId, customField.id),
        ),
      )

    await this.invalidate({ workspaceId, contactId })
  }

  async invalidate(props: {
    workspaceId: string
    contactId: string
  }): Promise<void> {
    await this.invalidateCacheTags([
      "contacts",
      `contacts:${props.workspaceId}`,
      `contacts:${props.contactId}`,
    ])
  }
}

export const contactCustomFieldService = new ContactCustomFieldService()
