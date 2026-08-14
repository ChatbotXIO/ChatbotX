import {
  contactCustomFieldService,
  customFieldService,
  externalRequestService,
} from "@chatbotx.io/business"
import { createSourceTimezoneResolver } from "@chatbotx.io/business/contact-custom-field"
import { javascriptExecutionService } from "@chatbotx.io/business/javascript-execution"
import { and, db, inArray } from "@chatbotx.io/database/client"
import {
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import { customFieldModel } from "@chatbotx.io/database/schema"
import {
  type CountCharactersStepSchema,
  type ExecuteJavascriptStepSchema,
  type ExternalRequestStepSchema,
  type FormatDateStepSchema,
  FormatTimezone,
  type GenerateCodeStepSchema,
  GenerateCodeType,
  type GetDataFromJsonStepSchema,
} from "@chatbotx.io/flow-config"
import {
  isTemporalCustomFieldType,
  SourceTimezoneStrategy,
} from "@chatbotx.io/utils/datetime"
import {
  contactVariableService,
  extractVariables,
  getSystemFieldValue,
  interpolate,
  resolveContactVariablesDeep,
} from "@chatbotx.io/variables"
import { faker } from "@faker-js/faker"
import { formatInTimeZone } from "date-fns-tz"
import { getProperty } from "dot-prop"
import { logger } from "../../lib/logger"
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

  await contactCustomFieldService.setValues({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    fields: [{ customFieldId: step.outputFieldId, value }],
  })
}

const FORMAT_DATE_TIMEZONE_STRATEGIES = {
  [FormatTimezone.contact]: SourceTimezoneStrategy.ContactThenWorkspace,
  [FormatTimezone.workspace]: SourceTimezoneStrategy.Workspace,
} as const satisfies Record<
  FormatDateStepSchema["timezone"],
  SourceTimezoneStrategy
>

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

  const outputCustomField = await customFieldService.findBy({
    where: { id: step.outputFieldId, workspaceId: conversation.workspaceId },
  })
  if (!outputCustomField || isTemporalCustomFieldType(outputCustomField.type)) {
    return
  }

  const resolveSourceTimezone = createSourceTimezoneResolver({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    strategy: FORMAT_DATE_TIMEZONE_STRATEGIES[step.timezone],
  })

  const newValue = formatInTimeZone(
    inputContactCustomField.value,
    await resolveSourceTimezone(),
    step.format,
  )

  await contactCustomFieldService.setValues({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    fields: [{ customFieldId: step.outputFieldId, value: newValue }],
  })
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
    await contactCustomFieldService.setValues({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      fields: [{ customFieldId: step.outputFieldId, value }],
    })
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
    },
  })
  const validCustomFieldIds = validCustomFields.map((v) => v.id)

  // setValues already batches existence lookup, normalization, persistence, and
  // change events into a single transaction — build the field list from the
  // mapping and hand the whole batch over in one call.
  const fields = mapping.flatMap((data) => {
    if (!validCustomFieldIds.includes(data.outputFieldId)) {
      return []
    }
    const value = getProperty(dataJSON, data.jsonPath)
    if (value === undefined || value === null) {
      return []
    }
    const encodedValue =
      typeof value === "string" ? value : JSON.stringify(value)
    return [{ customFieldId: data.outputFieldId, value: encodedValue }]
  })

  if (fields.length > 0) {
    await contactCustomFieldService.setValues({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      fields,
    })
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
  contactInbox: ExecuteStepProps<ExternalRequestStepSchema>["contactInbox"],
  conversation: ExecuteStepProps<ExternalRequestStepSchema>["conversation"],
  jsonBody: string,
): Promise<string> {
  const variableNames = extractVariables(jsonBody)
  if (variableNames.length === 0) {
    return jsonBody
  }

  const variables = await contactVariableService.getAll({
    contactId,
    contactInbox,
    conversation,
  })
  const { customFieldsMap } = variables

  const mapping: Record<string, string> = {}
  for (const variable of variableNames) {
    if (systemFieldTypes.options.includes(variable as SystemFieldType)) {
      const systemValue = await getSystemFieldValue(
        variables,
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

  return interpolate(jsonBody, mapping)
}

export async function externalRequest({
  contactInbox,
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
    { contactInbox, conversation },
  )
  const resolvedBody =
    body?.bodyType === "json"
      ? {
          ...body,
          jsonBody: await resolveJsonBodyVariables(
            conversation.contactId,
            contactInbox,
            conversation,
            body.jsonBody,
          ),
        }
      : await resolveContactVariablesDeep(conversation.contactId, body, {
          contactInbox,
          conversation,
        })

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

export async function handleExecuteJavascript({
  contactInbox,
  conversation,
  step,
}: ExecuteStepProps<ExecuteJavascriptStepSchema>): Promise<ExecuteStepResult> {
  try {
    const variables = await contactVariableService.getAll({
      contactId: conversation.contactId,
      contactInbox,
      conversation,
    })
    const input: Record<string, unknown> = Object.fromEntries(
      [...variables.customFieldsMap.entries()].map(([name, field]) => [
        name,
        field.value,
      ]),
    )

    const systemFieldEntries = await Promise.all(
      systemFieldTypes.options.map(
        async (systemField) =>
          [
            systemField,
            await getSystemFieldValue(variables, systemField),
          ] as const,
      ),
    )
    for (const [systemField, value] of systemFieldEntries) {
      input[systemField] = value
    }

    await javascriptExecutionService.executeAndMap({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      code: step.code,
      input,
      customFieldId: step.customFieldId,
    })

    return { status: "success", result: null }
  } catch (error) {
    logger.error({ err: error }, "[handleExecuteJavascript] failed")
    return {
      status: "error",
      errorMessage:
        error instanceof Error ? error.message : "JavaScript execution failed",
      result: null,
    }
  }
}
