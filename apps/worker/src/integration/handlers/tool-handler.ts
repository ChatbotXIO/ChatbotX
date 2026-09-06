import {
  botFieldService,
  contactCustomFieldService,
  customFieldService,
  externalRequestService,
} from "@chatbotx.io/business"
import { createSourceTimezoneResolver } from "@chatbotx.io/business/contact-custom-field"
import { javascriptExecutionService } from "@chatbotx.io/business/javascript-execution"
import {
  type CustomFieldType,
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import {
  type CountCharactersStepSchema,
  type ExecuteJavascriptStepSchema,
  type ExternalRequestStepSchema,
  FieldReferenceKind,
  type FormatDateStepSchema,
  FormatTimezone,
  type GenerateCodeStepSchema,
  GenerateCodeType,
  type GetDataFromJsonStepSchema,
  parseFieldReference,
} from "@chatbotx.io/flow-config"
import {
  isTemporalCustomFieldType,
  SourceTimezoneStrategy,
} from "@chatbotx.io/utils/datetime"
import {
  coerceCustomFieldValueForJavascript,
  contactVariableService,
  extractVariables,
  getSystemFieldValue,
  interpolate,
  interpolateIntoJavascript,
  resolveContactVariablesDeep,
  resolveJavascriptInput,
} from "@chatbotx.io/variables"
import { faker } from "@faker-js/faker"
import { formatInTimeZone } from "date-fns-tz"
import { getProperty } from "dot-prop"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

// ---------------------------------------------------------------------------
// Shared field-reference read/write helpers for the tool steps below
// (countCharacters, formatDate, generateCode, getDataFromJSON). Each step's
// `inputFieldId` / `outputFieldId` / `mapping[].outputFieldId` slot may now
// hold either a ContactCustomField id (legacy, unprefixed) or a `bot_field:
// <id>` Account Field reference token — `parseFieldReference` tells the two
// apart by value shape. Kept local to this file since only these four
// handlers need field-reference-aware I/O; `setContactCustomField` (the "Set
// Custom Field" step, in ./contact.ts) has its own bot-field-aware path via
// `contactCustomFieldService.setValueByKey`.
// ---------------------------------------------------------------------------

/**
 * True when the referenced field exists — a workspace-scoped ContactCustomField
 * definition, or (also workspace-scoped) an Account Field. Used as an
 * up-front guard before reading/computing a value, mirroring the original
 * `countCharacters` existence check. Routed through the business layer
 * (`customFieldService`/`botFieldService`) rather than querying `db` directly
 * — see `.agents/rules/data-access.md`.
 */
async function referencedFieldExists({
  fieldId,
  workspaceId,
}: {
  fieldId: string
  workspaceId: string
}): Promise<boolean> {
  const reference = parseFieldReference(fieldId)
  if (reference.kind === FieldReferenceKind.botField) {
    const botField = await botFieldService.find({
      workspaceId,
      id: reference.id,
    })
    return Boolean(botField)
  }
  const customField = await customFieldService.findBy({
    where: { id: fieldId, workspaceId },
  })
  return Boolean(customField)
}

/**
 * Reads a field's stored value regardless of kind. Returns `undefined` when
 * the field doesn't exist or the contact/workspace has no value stored yet —
 * callers treat that as "skip this step", matching the pre-bot-field
 * behavior of a missing `contactCustomFieldModel` row. Routed through
 * `contactCustomFieldService.findValue`/`botFieldService.findByKey` rather
 * than querying `db` directly — see `.agents/rules/data-access.md`.
 */
async function readReferencedFieldValue({
  fieldId,
  workspaceId,
  contactId,
}: {
  fieldId: string
  workspaceId: string
  contactId: string
}): Promise<string | undefined> {
  const reference = parseFieldReference(fieldId)
  if (reference.kind === FieldReferenceKind.botField) {
    const botField = await botFieldService.findByKey({
      workspaceId,
      key: reference.id,
    })
    return botField?.value ?? undefined
  }
  const value = await contactCustomFieldService.findValue({
    contactId,
    customFieldId: fieldId,
  })
  return value ?? undefined
}

/** Resolves a field's `CustomFieldType`, regardless of kind. */
async function resolveReferencedFieldType({
  fieldId,
  workspaceId,
}: {
  fieldId: string
  workspaceId: string
}): Promise<CustomFieldType | undefined> {
  const reference = parseFieldReference(fieldId)
  if (reference.kind === FieldReferenceKind.botField) {
    const botField = await botFieldService.find({
      workspaceId,
      id: reference.id,
    })
    return botField?.type
  }
  const customField = await customFieldService.findBy({
    where: { id: reference.key, workspaceId },
  })
  return customField?.type
}

/**
 * Writes a single field's value regardless of kind. Custom-field writes keep
 * calling `setValues` unchanged (same call shape existing tests assert on).
 * Account Field writes go through `setValueByKey` with `allowBotFields:
 * true` — mirroring the "Set Custom Field" step's write path — and are
 * logged + swallowed on failure (e.g. a since-deleted bot field) so one bad
 * output never kills the rest of the flow step's job.
 */
async function writeReferencedFieldValue({
  fieldId,
  workspaceId,
  contactId,
  value,
}: {
  fieldId: string
  workspaceId: string
  contactId: string
  value: string
}): Promise<void> {
  const reference = parseFieldReference(fieldId)
  if (reference.kind === FieldReferenceKind.botField) {
    try {
      await contactCustomFieldService.setValueByKey({
        workspaceId,
        contactId,
        keyword: fieldId,
        value,
        allowBotFields: true,
      })
    } catch (error: unknown) {
      logger.error(
        { err: error, workspaceId, contactId, fieldId },
        "Failed to write Account Field value from a tool step; continuing",
      )
    }
    return
  }

  await contactCustomFieldService.setValues({
    workspaceId,
    contactId,
    fields: [{ customFieldId: fieldId, value }],
  })
}

export async function countCharacters({
  conversation,
  step,
}: ExecuteStepProps<CountCharactersStepSchema>) {
  const { workspaceId, contactId } = conversation

  const [inputExists, outputExists] = await Promise.all([
    referencedFieldExists({ fieldId: step.inputFieldId, workspaceId }),
    referencedFieldExists({ fieldId: step.outputFieldId, workspaceId }),
  ])
  if (!(inputExists && outputExists)) {
    return
  }

  const inputValue = await readReferencedFieldValue({
    fieldId: step.inputFieldId,
    workspaceId,
    contactId,
  })
  if (inputValue === undefined) {
    return
  }

  const value = `${inputValue.length}`

  await writeReferencedFieldValue({
    fieldId: step.outputFieldId,
    workspaceId,
    contactId,
    value,
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
  const { workspaceId, contactId } = conversation

  const inputValue = await readReferencedFieldValue({
    fieldId: step.inputFieldId,
    workspaceId,
    contactId,
  })
  if (inputValue === undefined) {
    return
  }

  // Writing a display string into a temporal output field would be re-parsed
  // and corrupt the stored value — reject regardless of whether the output
  // is a ContactCustomField or an Account Field.
  const outputType = await resolveReferencedFieldType({
    fieldId: step.outputFieldId,
    workspaceId,
  })
  if (!outputType || isTemporalCustomFieldType(outputType)) {
    return
  }

  const resolveSourceTimezone = createSourceTimezoneResolver({
    workspaceId,
    contactId,
    strategy: FORMAT_DATE_TIMEZONE_STRATEGIES[step.timezone],
  })

  const newValue = formatInTimeZone(
    inputValue,
    await resolveSourceTimezone(),
    step.format,
  )

  await writeReferencedFieldValue({
    fieldId: step.outputFieldId,
    workspaceId,
    contactId,
    value: newValue,
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
    await writeReferencedFieldValue({
      fieldId: step.outputFieldId,
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      value,
    })
  }
}

/** Stringifies a resolved JSON-path value for storage; `null`/`undefined` mean "no value to write". */
function encodeJsonPathValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }
  return typeof value === "string" ? value : JSON.stringify(value)
}

export async function getDataFromJSON({
  conversation,
  step,
}: ExecuteStepProps<GetDataFromJsonStepSchema>): Promise<ExecuteStepResult> {
  const { workspaceId, contactId } = conversation

  const inputValue = await readReferencedFieldValue({
    fieldId: step.inputFieldId,
    workspaceId,
    contactId,
  })
  if (inputValue === undefined) {
    return {
      status: "error",
      errorMessage: "Input custom field not found",
      result: null,
    }
  }

  let dataJSON: unknown
  try {
    dataJSON = JSON.parse(inputValue)
  } catch {
    return {
      status: "error",
      errorMessage: "Input custom field value is not valid JSON",
      result: null,
    }
  }

  const mapping = step.mapping.map((entry) => ({
    ...entry,
    reference: parseFieldReference(entry.outputFieldId),
  }))
  const customFieldMapping = mapping.filter(
    (entry) => entry.reference.kind === FieldReferenceKind.customField,
  )
  const botFieldMapping = mapping.filter(
    (entry) => entry.reference.kind === FieldReferenceKind.botField,
  )

  // Custom-field outputs: unchanged behavior — batched existence lookup then
  // a single `setValues` call (transactional persistence + change events).
  if (customFieldMapping.length > 0) {
    const validCustomFields = await customFieldService.findManyByIds({
      workspaceId,
      ids: customFieldMapping.map((entry) => entry.outputFieldId),
    })
    const validCustomFieldIds = new Set(validCustomFields.map((v) => v.id))

    const fields = customFieldMapping.flatMap((entry) => {
      if (!validCustomFieldIds.has(entry.outputFieldId)) {
        return []
      }
      const encodedValue = encodeJsonPathValue(
        getProperty(dataJSON, entry.jsonPath),
      )
      if (encodedValue === null) {
        return []
      }
      return [{ customFieldId: entry.outputFieldId, value: encodedValue }]
    })

    if (fields.length > 0) {
      await contactCustomFieldService.setValues({
        workspaceId,
        contactId,
        fields,
      })
    }
  }

  // Account Field outputs: one `setValueByKey` write per mapping entry — a
  // missing or failing bot field is logged and skipped by
  // `writeReferencedFieldValue`, never thrown.
  await Promise.all(
    botFieldMapping.map(async (entry) => {
      const encodedValue = encodeJsonPathValue(
        getProperty(dataJSON, entry.jsonPath),
      )
      if (encodedValue === null) {
        return
      }
      await writeReferencedFieldValue({
        fieldId: entry.outputFieldId,
        workspaceId,
        contactId,
        value: encodedValue,
      })
    }),
  )

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
    // Coerced the same way resolveJavascriptInput coerces `{{name}}`
    // lookups below, so a custom field is typed consistently in `input`
    // regardless of whether the code reaches it via `input["name"]` or via
    // a `{{name}}` placeholder rewritten to that same property access.
    const input: Record<string, unknown> = Object.fromEntries(
      [...variables.customFieldsMap.entries()].map(([name, field]) => [
        name,
        coerceCustomFieldValueForJavascript(field.value, field.type),
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

    // Authors can reference contact/system/custom/coupon fields as
    // `{{name}}` in the code, same as the Tiptap picker inserts elsewhere.
    // Every referenced name is resolved to a plain value and merged into
    // `input` (coupons are the only name here not already in `input` above),
    // then `step.code`'s placeholders are rewritten to `input["name"]`
    // property-access expressions — never a spliced value — so a
    // contact-controlled value can never be interpreted as JavaScript. See
    // resolveJavascriptInput / interpolateIntoJavascript in
    // @chatbotx.io/variables.
    const jsInputEntries = await resolveJavascriptInput(step.code, variables)
    for (const [name, value] of jsInputEntries) {
      input[name] = value
    }
    const code = interpolateIntoJavascript(
      step.code,
      new Set(jsInputEntries.keys()),
    )

    await javascriptExecutionService.executeAndMap({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      code,
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
