import { and, type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { contactCustomFieldModel } from "@chatbotx.io/database/schema"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import { createId, isNumericId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { contactCustomFieldValueService } from "./value-service"

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

type SetValueByKeyInput = DeleteByKeyInput & {
  value: string
}

class ContactCustomFieldService extends BaseService {
  async listValues(input: { contactId: string }) {
    return await db.query.contactCustomFieldModel.findMany({
      where: { contactId: input.contactId },
      columns: { customFieldId: true, value: true },
    })
  }

  async findValue(input: {
    contactId: string
    customFieldId: string
  }): Promise<string | null> {
    return await contactCustomFieldValueService.findValue(input)
  }

  async listWithDefinitions(input: {
    contactId: string
    tx?: DatabaseClient
  }): Promise<{ name: string; value: string }[]> {
    const { contactId, tx = db } = input
    const rows = await tx.query.contactCustomFieldModel.findMany({
      where: { contactId },
      columns: { value: true },
      with: {
        customField: {
          columns: { name: true },
        },
      },
      orderBy: { id: "asc" },
    })
    return rows.map((row) => ({
      name: row.customField.name,
      value: row.value,
    }))
  }

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

    const changedFields = customFields.flatMap((customField) => {
      const field = fields.find((f) => f.customFieldId === customField.id)
      if (!field) {
        return []
      }
      const existing = existingValues.find(
        (value) => value.customFieldId === customField.id,
      )
      if (existing?.value === field.value) {
        return []
      }
      return [
        { customField, field, existing, oldValue: existing?.value ?? null },
      ]
    })

    if (changedFields.length === 0) {
      return
    }

    await tx.transaction(async (innerTx) => {
      await Promise.all(
        changedFields.map(({ customField, field, existing }) => {
          if (existing) {
            return innerTx
              .update(contactCustomFieldModel)
              .set({ value: field.value })
              .where(eq(contactCustomFieldModel.id, existing.id))
          }
          return innerTx
            .insert(contactCustomFieldModel)
            .values({
              id: createId(),
              contactId,
              customFieldId: customField.id,
              value: field.value,
            })
            .onConflictDoUpdate({
              target: [
                contactCustomFieldModel.contactId,
                contactCustomFieldModel.customFieldId,
              ],
              set: { value: field.value },
            })
        }),
      )
    })

    for (const { customField, field, oldValue } of changedFields) {
      emitCustomFieldChanged(
        workspaceId,
        contactId,
        customField.id,
        customField.name,
        oldValue,
        field.value,
        // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
      ).catch(() => {})
    }

    await this.invalidate({ workspaceId, contactId })
  }

  async clearByContactId(input: {
    workspaceId: string
    contactId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { tx = db } = input
    await tx
      .delete(contactCustomFieldModel)
      .where(eq(contactCustomFieldModel.contactId, input.contactId))
    await this.invalidate(input)
  }

  async setValueByKey(input: SetValueByKeyInput): Promise<void> {
    const { workspaceId, contactId, keyword, value } = input

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

    await this.setValues({
      workspaceId,
      contactId,
      fields: [{ customFieldId: customField.id, value }],
    })
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
