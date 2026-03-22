import { db } from "@aha.chat/database/client"
import type { contactCustomFieldModel } from "@aha.chat/database/schema"
import { uploader } from "@aha.chat/filesystem"
import {
  DefaultJobAction,
  defaultQueue,
  type JobExportContacts,
  loopableItemsCount,
} from "@aha.chat/worker-config"

const contactFieldPrefix = "ct:"
const customFieldPrefix = "cf:"
const tagPrefix = "tg:"

const headerNames: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  fullName: "Full Name",
  email: "Email",
  phoneNumber: "Phone Number",
  gender: "Gender",
  source: "Source",
  lastReadAt: "Last Read At",
  blockedAt: "Blocked At",
}

type SelectedField =
  | { type: "contact"; value: string; header: string }
  | { type: "custom"; value: string; header: string }
  | { type: "tag"; value: string; header: string }

const escapeCsvValue = (value: string): string => {
  if (!value) {
    return '""'
  }
  const normalized = value.replace(/\r?\n/g, " ")
  return `"${normalized.replace(/"/g, '""')}"`
}

const buildCsvChunk = (
  contacts: {
    [key: string]: unknown
    contactCustomFields?: (typeof contactCustomFieldModel.$inferSelect)[]
    tags?: { id: string }[]
  }[],
  selectedFields: SelectedField[],
  includeHeader: boolean,
): string => {
  const lines: string[] = []

  if (includeHeader) {
    lines.push(
      selectedFields.map((field) => escapeCsvValue(field.header)).join(","),
    )
  }

  for (const contact of contacts) {
    const rowValues: string[] = []

    for (const field of selectedFields) {
      if (field.type === "contact") {
        if (field.value === "fullName") {
          const firstName = (contact.firstName ?? "") as string
          const lastName = (contact.lastName ?? "") as string
          rowValues.push(escapeCsvValue(`${firstName} ${lastName}`.trim()))
          continue
        }

        const rawValue = contact[field.value as keyof typeof contact]
        if (rawValue instanceof Date) {
          rowValues.push(escapeCsvValue(rawValue.toISOString()))
        } else if (rawValue === null || rawValue === undefined) {
          rowValues.push('""')
        } else {
          rowValues.push(escapeCsvValue(String(rawValue)))
        }
      } else if (field.type === "custom") {
        const customField = contact.contactCustomFields?.find(
          (cf: typeof contactCustomFieldModel.$inferSelect) =>
            cf.customFieldId === field.value,
        )
        rowValues.push(
          customField?.value ? escapeCsvValue(customField.value) : '""',
        )
      } else {
        const hasTag = contact.tags?.some((tag) => tag.id === field.value)
        rowValues.push(hasTag ? escapeCsvValue("1") : '""')
      }
    }

    lines.push(rowValues.join(","))
  }

  return lines.join("\n") + (lines.length > 0 ? "\n" : "")
}

export const loopableExportContacts = async (
  data: JobExportContacts["data"],
) => {
  const { chatbotId, fields, contactIds, outputPath, outputFormat, cursor } =
    data

  if (outputFormat !== "csv") {
    return
  }

  const contacts = await db.query.contactModel.findMany({
    where: {
      id: { in: contactIds },
      chatbotId,
      ...(cursor
        ? {
            createdAt: {
              gte: new Date(cursor.createdAt),
            },
            id: {
              gt: cursor.id,
            },
          }
        : {}),
    },
    with: {
      contactCustomFields: true,
      tags: true,
    },
    limit: loopableItemsCount,
    orderBy: {
      createdAt: "asc",
      id: "asc",
    },
  })

  if (contacts.length === 0) {
    return
  }

  const requestedFieldMapping = fields.reduce(
    (acc, field) => {
      if (field.startsWith(tagPrefix)) {
        acc.push({
          type: "tag" as const,
          value: field.replace(tagPrefix, ""),
          header: "",
        })
      } else if (field.startsWith(customFieldPrefix)) {
        acc.push({
          type: "custom" as const,
          value: field.replace(customFieldPrefix, ""),
          header: "",
        })
      } else if (field.startsWith(contactFieldPrefix)) {
        acc.push({
          type: "contact" as const,
          value: field.replace(contactFieldPrefix, ""),
          header: "",
        })
      }
      return acc
    },
    [] as {
      type: "tag" | "custom" | "contact"
      value: string
      header: string
    }[],
  )

  const requestedTagIds = requestedFieldMapping
    .filter((field) => field.type === "tag")
    .map((field) => field.value)

  const tagNameById: Record<string, string> =
    requestedTagIds.length === 0
      ? {}
      : await db.query.tagModel
          .findMany({
            where: {
              id: { in: requestedTagIds },
              chatbotId,
            },
          })
          .then((tags) =>
            tags.reduce(
              (acc, tag) => {
                acc[tag.id] = tag.name
                return acc
              },
              {} as Record<string, string>,
            ),
          )

  const requestedCustomFieldIds = requestedFieldMapping
    .filter((field) => field.type === "custom")
    .map((field) => field.value)

  const customFieldNameById: Record<string, string> =
    requestedCustomFieldIds.length === 0
      ? {}
      : await db.query.customFieldModel
          .findMany({
            where: {
              id: { in: requestedCustomFieldIds },
              chatbotId,
            },
          })
          .then((customFields) =>
            customFields.reduce(
              (acc, customField) => {
                acc[customField.id] = customField.name
                return acc
              },
              {} as Record<string, string>,
            ),
          )

  const selectedFields: SelectedField[] = requestedFieldMapping.map((field) => {
    if (field.type === "contact") {
      return {
        type: "contact",
        value: field.value,
        header: headerNames[field.value] ?? field.value,
      }
    }

    if (field.type === "custom") {
      return {
        type: "custom",
        value: field.value,
        header: customFieldNameById[field.value] ?? field.value,
      }
    }

    return {
      type: "tag",
      value: field.value,
      header: tagNameById[field.value] ?? field.value,
    }
  })

  const includeHeader = !cursor

  const csvChunk = buildCsvChunk(contacts, selectedFields, includeHeader)

  let existing: Buffer | undefined
  try {
    existing = await uploader.getObject(outputPath)
  } catch {
    existing = undefined
  }

  const body =
    existing && existing.length > 0
      ? Buffer.concat([existing, Buffer.from(csvChunk)])
      : Buffer.from(csvChunk)

  await uploader.putObject(outputPath, body, {
    ContentType: "text/csv; charset=utf-8",
  })

  // Continue exporting contacts by re-dispatching the job with the last contact
  const lastContact = contacts.at(-1)
  if (lastContact) {
    await defaultQueue.add(DefaultJobAction.exportContacts, {
      type: DefaultJobAction.exportContacts,
      data: {
        ...data,
        cursor: {
          createdAt: lastContact.createdAt.toISOString(),
          id: lastContact.id,
        },
      },
    })
  }
}
