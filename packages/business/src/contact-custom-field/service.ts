import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import { contactCustomFieldModel } from "@chatbotx.io/database/schema"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import { createId, isNumericId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import {
  createSourceTimezoneResolver,
  normalizeCustomFieldValueForStorage,
} from "./normalize"
import { contactCustomFieldValueService } from "./value-service"

type SetValuesInput = {
  workspaceId: string
  contactId: string
  fields: Array<{ customFieldId: string; value: string }>
  /** Browser zone captured at form submit; anchors naive `date` values. */
  sourceTimezone?: string
}

type DeleteByKeyInput = {
  workspaceId: string
  contactId: string
  keyword: string
}

type DeleteByCustomFieldIdInput = {
  workspaceId: string
  contactIds: string[]
  customFieldId: string
  tx?: DatabaseClient
}

type InsertNormalizedValuesForNewContactsInput = {
  workspaceId: string
  entries: Array<{
    contactId: string
    fields: Array<{ customFieldId: string; value: string }>
  }>
  tx?: DatabaseClient
}

type SetValueByKeyInput = DeleteByKeyInput & {
  value: string
}

// Cache tags for contact-scoped invalidation. Building the full set in one call
// lets a bulk operation invalidate N contacts with a single cache round-trip
// instead of N awaited calls.
const contactCacheTags = (
  workspaceId: string,
  contactIds: string[],
): string[] => [
  "contacts",
  `contacts:${workspaceId}`,
  ...contactIds.map((contactId) => `contacts:${contactId}`),
]

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
    const { workspaceId, contactId, fields, sourceTimezone } = input
    const customFieldIds = fields.map((f) => f.customFieldId)
    const fieldById = new Map(
      fields.map((field) => [field.customFieldId, field] as const),
    )

    const run = async (client: DatabaseClient) => {
      const customFields = await client.query.customFieldModel.findMany({
        where: { workspaceId, id: { in: customFieldIds } },
        columns: { id: true, name: true, type: true },
      })

      if (customFields.length === 0) {
        return []
      }

      const existingValues =
        await client.query.contactCustomFieldModel.findMany({
          where: { contactId, customFieldId: { in: customFieldIds } },
        })
      const existingById = new Map(
        existingValues.map((value) => [value.customFieldId, value] as const),
      )
      const resolveSourceTimezone = createSourceTimezoneResolver({
        workspaceId,
        contactId,
        tx: client,
      })

      const changedFields = await Promise.all(
        customFields.map(async (customField) => {
          const field = fieldById.get(customField.id)
          if (!field) {
            return null
          }

          const normalizedValue = await normalizeCustomFieldValueForStorage({
            type: customField.type,
            value: field.value,
            resolveSourceTimezone,
            explicitTimezone: sourceTimezone,
          })
          // Un-normalizable temporal value: skip rather than persist garbage.
          if (normalizedValue === null) {
            return null
          }
          const existing = existingById.get(customField.id)
          if (existing?.value === normalizedValue) {
            return null
          }

          return {
            customField,
            existing,
            oldValue: existing?.value ?? null,
            value: normalizedValue,
          }
        }),
      )

      const valuesToPersist = changedFields.filter(
        (field) => field !== null,
      ) as NonNullable<(typeof changedFields)[number]>[]

      if (valuesToPersist.length === 0) {
        return []
      }

      await Promise.all(
        valuesToPersist.map(({ customField, value, existing }) => {
          if (existing) {
            return client
              .update(contactCustomFieldModel)
              .set({ value })
              .where(eq(contactCustomFieldModel.id, existing.id))
          }
          return client
            .insert(contactCustomFieldModel)
            .values({
              id: createId(),
              contactId,
              customFieldId: customField.id,
              value,
            })
            .onConflictDoUpdate({
              target: [
                contactCustomFieldModel.contactId,
                contactCustomFieldModel.customFieldId,
              ],
              set: { value },
            })
        }),
      )

      return valuesToPersist
    }

    const valuesToPersist =
      tx === db
        ? await tx.transaction(async (innerTx) => run(innerTx))
        : await run(tx)

    for (const { customField, oldValue, value } of valuesToPersist) {
      emitCustomFieldChanged(
        workspaceId,
        contactId,
        customField.id,
        customField.name,
        oldValue,
        value,
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

  async deleteByCustomFieldId(
    input: DeleteByCustomFieldIdInput,
  ): Promise<void> {
    const { workspaceId, contactIds, customFieldId, tx = db } = input
    if (contactIds.length === 0) {
      return
    }

    await tx
      .delete(contactCustomFieldModel)
      .where(
        and(
          inArray(contactCustomFieldModel.contactId, contactIds),
          eq(contactCustomFieldModel.customFieldId, customFieldId),
        ),
      )

    // Bulk delete stays event-free by design: emitting customFieldChanged per
    // contact would enqueue one trigger/webhook job per affected contact, so
    // clearing a field across a large audience could burst the queues. The
    // single-contact clear (deleteByKey / flow-step clearContactCustomField) is
    // the only delete that emits. Cache is invalidated in one batched call.
    await this.invalidateCacheTags(contactCacheTags(workspaceId, contactIds))
  }

  async insertNormalizedValuesForNewContacts(
    input: InsertNormalizedValuesForNewContactsInput,
  ): Promise<void> {
    const { entries, tx = db } = input
    const values = entries.flatMap(({ contactId, fields }) =>
      fields.map((field) => ({
        id: createId(),
        contactId,
        customFieldId: field.customFieldId,
        value: field.value,
      })),
    )

    if (values.length === 0) {
      return
    }

    await tx.insert(contactCustomFieldModel).values(values)
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

    let customField: { id: string; name: string } | undefined

    if (isNumericId(keyword)) {
      customField = await db.query.customFieldModel.findFirst({
        where: { id: keyword, workspaceId },
        columns: { id: true, name: true },
      })
    }

    if (!customField) {
      customField = await db.query.customFieldModel.findFirst({
        where: { name: keyword, workspaceId },
        columns: { id: true, name: true },
      })
    }

    if (!customField) {
      throw notFoundException("Custom field not found")
    }

    // Single-contact clear is the only delete that emits a change event. Snapshot
    // the value BEFORE deleting so we emit an accurate value -> null and stay
    // silent on a no-op delete (the contact never held the field). The bulk path
    // owns the delete + batched cache invalidation; emission is bounded to one
    // event here, which is queue-safe unlike a per-contact fan-out.
    const oldValue = await this.findValue({
      contactId,
      customFieldId: customField.id,
    })

    await this.deleteByCustomFieldId({
      workspaceId,
      contactIds: [contactId],
      customFieldId: customField.id,
    })

    if (oldValue === null) {
      return
    }

    emitCustomFieldChanged(
      workspaceId,
      contactId,
      customField.id,
      customField.name,
      oldValue,
      null,
      // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
    ).catch(() => {})
  }

  async invalidate(props: {
    workspaceId: string
    contactId: string
  }): Promise<void> {
    await this.invalidateCacheTags(
      contactCacheTags(props.workspaceId, [props.contactId]),
    )
  }
}

export const contactCustomFieldService = new ContactCustomFieldService()
