import { externalRequestService } from "@chatbotx.io/business"
import { and, db, inArray } from "@chatbotx.io/database/client"
import {
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import {
  contactCustomFieldModel,
  customFieldModel,
} from "@chatbotx.io/database/schema"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import {
  type CountCharactersStepSchema,
  type ExternalRequestStepSchema,
  type FormatDateStepSchema,
  type GenerateCodeStepSchema,
  GenerateCodeType,
  type GetDataFromJsonStepSchema,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import {
  contactVariableService,
  extractVariables,
  getSystemFieldValue,
  resolveContactVariablesDeep,
} from "@chatbotx.io/variables"
import { faker } from "@faker-js/faker"
import { format } from "date-fns"
import { getProperty } from "dot-prop"
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

export async function countCharacters({
  conversation,
  step,
}: ExecuteStepProps<CountCharactersStepSchema>) {
  const customFieldIds = [step.inputFieldId, step.outputFieldId]
  const customFieldsCount = await db.$count(
    customFieldModel,
    and(inArray(customFieldModel.id, customFieldIds)),
  )
  if (customFieldsCount !== 2) {
    return
  }

  // Find target contact custom field
  const targetContactCustomField =
    await db.query.contactCustomFieldModel.findFirst({
      where: {
        customFieldId: step.inputFieldId,
        contactId: conversation.contactId,
      },
    })
  if (!targetContactCustomField) {
    return
  }

  const value = `${`${targetContactCustomField.value}`.length}`

  // Get existing value and custom field name
  const existing = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
    },
    columns: { value: true },
  })

  const customField = await db.query.customFieldModel.findFirst({
    where: { id: step.outputFieldId },
    columns: { name: true },
  })

  await db
    .insert(contactCustomFieldModel)
    .values({
      id: createId(),
      value,
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
    })
    .onConflictDoUpdate({
      target: [
        contactCustomFieldModel.contactId,
        contactCustomFieldModel.customFieldId,
      ],
      set: {
        value,
      },
    })

  await emitCustomFieldChanged(
    conversation.workspaceId,
    conversation.contactId,
    step.outputFieldId,
    customField?.name || step.outputFieldId,
    existing?.value || null,
    value,
  )
}

export async function formatDate({
  conversation,
  step,
}: ExecuteStepProps<FormatDateStepSchema>) {
  const inputContactCustomField =
    await db.query.contactCustomFieldModel.findFirst({
      where: {
        customFieldId: step.inputFieldId,
        contactId: conversation.contactId,
      },
    })
  if (!inputContactCustomField) {
    return
  }

  const newValue = format(new Date(inputContactCustomField.value), step.format)

  // Get existing value and custom field name
  const existing = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
    },
    columns: { value: true },
  })

  const customField = await db.query.customFieldModel.findFirst({
    where: { id: step.outputFieldId },
    columns: { name: true },
  })

  await db
    .insert(contactCustomFieldModel)
    .values({
      id: createId(),
      value: newValue,
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
    })
    .onConflictDoUpdate({
      target: [
        contactCustomFieldModel.contactId,
        contactCustomFieldModel.customFieldId,
      ],
      set: {
        value: newValue,
      },
    })

  await emitCustomFieldChanged(
    conversation.workspaceId,
    conversation.contactId,
    step.outputFieldId,
    customField?.name || step.outputFieldId,
    existing?.value || null,
    newValue,
  )
}

export async function generateCode({
  conversation,
  step,
}: ExecuteStepProps<GenerateCodeStepSchema>) {
  let value: string | null = null
  switch (step.type) {
    case GenerateCodeType.NUMERIC_LENGTH: {
      const min = 10 ** (step.min - 1)
      const max = 10 ** step.max - 1
      value = `${faker.number.int({ min, max })}`
      break
    }
    case GenerateCodeType.NUMERIC_VALUE: {
      value = `${faker.number.int({ min: step.min, max: step.max })}`
      break
    }
    case GenerateCodeType.ALPHANUMERIC_LENGTH: {
      value = faker.string.alpha({ length: { min: step.min, max: step.max } })
      break
    }
    default:
      break
  }

  if (value) {
    // Get existing value and custom field name
    const existing = await db.query.contactCustomFieldModel.findFirst({
      where: {
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
      },
      columns: { value: true },
    })

    const customField = await db.query.customFieldModel.findFirst({
      where: { id: step.outputFieldId },
      columns: { name: true },
    })

    await db
      .insert(contactCustomFieldModel)
      .values({
        id: createId(),
        value,
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
      })
      .onConflictDoUpdate({
        target: [
          contactCustomFieldModel.contactId,
          contactCustomFieldModel.customFieldId,
        ],
        set: {
          value,
        },
      })

    await emitCustomFieldChanged(
      conversation.workspaceId,
      conversation.contactId,
      step.outputFieldId,
      customField?.name || step.outputFieldId,
      existing?.value || null,
      value,
    )
  }
}

export async function getDataFromJSON({
  conversation,
  step,
}: ExecuteStepProps<GetDataFromJsonStepSchema>): Promise<ExecuteStepResult> {
  const inputValue = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.inputFieldId,
    },
  })
  if (!inputValue) {
    return {
      status: "error",
      errorMessage: "Input custom field not found",
      result: null,
    }
  }

  let dataJSON: unknown
  try {
    dataJSON = JSON.parse(inputValue.value)
  } catch {
    return {
      status: "error",
      errorMessage: "Input custom field value is not valid JSON",
      result: null,
    }
  }

  const mapping = step.mapping

  // Find valid custom fields
  const validCustomFields = await db.query.customFieldModel.findMany({
    where: {
      workspaceId: conversation.workspaceId,
      id: {
        in: mapping.map((m) => m.outputFieldId),
      },
    },
    columns: {
      id: true,
      name: true,
    },
  })
  const validCustomFieldIds = validCustomFields.map((v) => v.id)
  const customFieldMap = new Map(validCustomFields.map((f) => [f.id, f.name]))

  const updatedFields = await db.transaction(async (tx) => {
    const updated: Array<{
      customFieldId: string
      customFieldName: string
      oldValue: string | null
      newValue: string
    }> = []

    // Batch-fetch existing values to avoid N+1 queries
    const existingFields = await tx.query.contactCustomFieldModel.findMany({
      where: {
        contactId: conversation.contactId,
        customFieldId: { in: validCustomFieldIds },
      },
      columns: { customFieldId: true, value: true },
    })
    const existingMap = new Map(
      existingFields.map((f) => [f.customFieldId, f.value]),
    )

    for (const data of mapping) {
      if (validCustomFieldIds.includes(data.outputFieldId)) {
        const value = getProperty(dataJSON, data.jsonPath)

        if (value !== undefined && value !== null) {
          const encodedValue =
            typeof value === "string" ? value : JSON.stringify(value)
          const oldValue = existingMap.get(data.outputFieldId) ?? null

          await tx
            .insert(contactCustomFieldModel)
            .values({
              id: createId(),
              value: encodedValue,
              contactId: conversation.contactId,
              customFieldId: data.outputFieldId,
            })
            .onConflictDoUpdate({
              target: [
                contactCustomFieldModel.contactId,
                contactCustomFieldModel.customFieldId,
              ],
              set: {
                value: encodedValue,
              },
            })

          updated.push({
            customFieldId: data.outputFieldId,
            customFieldName:
              customFieldMap.get(data.outputFieldId) || data.outputFieldId,
            oldValue,
            newValue: encodedValue,
          })
        }
      }
    }

    return updated
  })

  for (const field of updatedFields) {
    await emitCustomFieldChanged(
      conversation.workspaceId,
      conversation.contactId,
      field.customFieldId,
      field.customFieldName,
      field.oldValue,
      field.newValue,
    )
  }

  return { status: "success", result: null }
}

/**
 * Substitutes `{{var}}` placeholders in a JSON-body string with
 * JSON.stringify-escaped values so contact data containing quotes,
 * backslashes, or newlines can't break the resulting JSON payload.
 */
async function resolveJsonBodyVariables(
  contactId: string,
  jsonBody: string,
): Promise<string> {
  const variableNames = extractVariables(jsonBody)
  if (variableNames.length === 0) {
    return jsonBody
  }

  const { contact, customFieldsMap } =
    await contactVariableService.getAll(contactId)

  const mapping: Record<string, string> = {}
  for (const variable of variableNames) {
    if (systemFieldTypes.options.includes(variable as SystemFieldType)) {
      const systemValue = await getSystemFieldValue(
        contact,
        variable as SystemFieldType,
      )
      if (systemValue) {
        mapping[variable] = JSON.stringify(systemValue).slice(1, -1)
      }
    } else if (customFieldsMap.has(variable)) {
      const rawValue = String(customFieldsMap.get(variable)?.value)
      mapping[variable] = JSON.stringify(rawValue).slice(1, -1)
    }
  }

  return jsonBody.replace(
    /\{\{(\w+)\}\}/g,
    (match, variable) => mapping[variable] ?? match,
  )
}

export async function externalRequest({
  conversation,
  step,
}: ExecuteStepProps<ExternalRequestStepSchema>): Promise<ExecuteStepResult> {
  // Resolve everything except body.jsonBody through the generic deep-replace
  // (raw substitution); jsonBody needs JSON-escaped substitution instead so
  // contact data can't produce invalid or maliciously-injected JSON.
  const { body, ...stepWithoutBody } = step
  const resolvedStepWithoutBody = await resolveContactVariablesDeep(
    conversation.contactId,
    stepWithoutBody,
  )
  const resolvedBody =
    body?.bodyType === "json"
      ? {
          ...body,
          jsonBody: await resolveJsonBodyVariables(
            conversation.contactId,
            body.jsonBody,
          ),
        }
      : await resolveContactVariablesDeep(conversation.contactId, body)

  try {
    const result = await externalRequestService.executeAndMap({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      input: {
        method: resolvedStepWithoutBody.method,
        url: resolvedStepWithoutBody.url,
        headers: resolvedStepWithoutBody.headers,
        body: resolvedBody,
      },
      mapping: resolvedStepWithoutBody.mapping,
    })

    if (result.statusCode >= 400) {
      return {
        status: "error",
        errorMessage: `Request failed with status ${result.statusCode}`,
        result: null,
      }
    }

    return { status: "success", result: null }
  } catch (error) {
    return {
      status: "error",
      errorMessage:
        error instanceof Error ? error.message : "External request failed",
      result: null,
    }
  }
}
