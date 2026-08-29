import {
  botFieldService,
  contactCustomFieldService,
} from "@chatbotx.io/business"
import {
  FieldReferenceKind,
  parseFieldReference,
  type SpreadsheetContactToSheetMappingSchema,
  type SpreadsheetSendDataSchema,
  type SpreadsheetStepVersion,
  type SpreadsheetUpdateRowSchema,
  spreadsheetStepVersions,
  toSpreadsheetStepVersion,
} from "@chatbotx.io/flow-config"
import { contactVariableService } from "@chatbotx.io/variables"
import type { ExecuteStepProps } from "./flow"

type SpreadsheetWriteStepSchema =
  | SpreadsheetSendDataSchema
  | SpreadsheetUpdateRowSchema

export type WriteValueResolver = (
  props: ExecuteStepProps<SpreadsheetWriteStepSchema>,
) => Promise<string[]>

/**
 * Batches the distinct `bot_field:<id>` tokens out of a v1 Contact→Sheet
 * mapping into a single workspace-scoped lookup — mirrors the Sheet→Contact
 * write side (`spreadsheet-handler.ts`'s `updateContactCustomFields`), which
 * already supports bot field tokens. A blank/unset bot field value resolves
 * to "" rather than being dropped.
 */
const resolveBotFieldValues = async ({
  workspaceId,
  map,
}: {
  workspaceId: string
  map: Pick<SpreadsheetContactToSheetMappingSchema, "customFieldId">[]
}): Promise<Map<string, string>> => {
  const botFieldIds = [
    ...new Set(
      map.flatMap((item) => {
        if (!item.customFieldId) {
          return []
        }
        const reference = parseFieldReference(item.customFieldId)
        return reference.kind === FieldReferenceKind.botField
          ? [reference.id]
          : []
      }),
    ),
  ]
  if (botFieldIds.length === 0) {
    return new Map()
  }

  const botFields = await botFieldService.findManyByIds({
    workspaceId,
    ids: botFieldIds,
  })
  return new Map(botFields.map((field) => [field.id, field.value ?? ""]))
}

const resolveFromCustomFields: WriteValueResolver = async ({
  conversation,
  step,
}) => {
  const [storedValues, botFieldValues] = await Promise.all([
    contactCustomFieldService.listValues({
      contactId: conversation.contactId,
    }),
    resolveBotFieldValues({
      workspaceId: conversation.workspaceId,
      map: step.map,
    }),
  ])
  const valueByCustomFieldId = new Map(
    storedValues.map((field) => [field.customFieldId, field.value]),
  )

  return step.map.map((item) => {
    if (!item.customFieldId) {
      return ""
    }
    const reference = parseFieldReference(item.customFieldId)
    if (reference.kind === FieldReferenceKind.botField) {
      return botFieldValues.get(reference.id) ?? ""
    }
    return valueByCustomFieldId.get(item.customFieldId) ?? ""
  })
}

const resolveFromVariableTemplates: WriteValueResolver = async (props) => {
  const variables = await contactVariableService.getAll({
    contactId: props.conversation.contactId,
    contactInbox: props.contactInbox,
    conversation: props.conversation,
  })

  return await Promise.all(
    props.step.map.map((mapItem) =>
      contactVariableService.replaceAll({
        text: mapItem.value ?? "",
        variables,
      }),
    ),
  )
}

const writeValueResolvers = {
  [spreadsheetStepVersions.enum.v1]: resolveFromCustomFields,
  [spreadsheetStepVersions.enum.v2]: resolveFromVariableTemplates,
} satisfies Record<SpreadsheetStepVersion, WriteValueResolver>

export const buildSpreadsheetWriteData: WriteValueResolver = (props) =>
  writeValueResolvers[toSpreadsheetStepVersion(props.step.version)](props)

/**
 * Places each resolved value into the column that matches its mapping header,
 * so writes stay correct regardless of column order. Mappings whose header no
 * longer exists in the sheet (`indexOf === -1`) are skipped rather than shifting
 * every following column. `baseRow` seeds the row for updates so unmapped
 * columns keep their existing value; leave it empty for appends.
 *
 * With `skipEmptyValues` (used by Update Row), a mapping that resolves to an
 * empty string leaves the existing cell untouched instead of blanking it, so
 * only explicitly-set values overwrite.
 */
export const alignWriteValuesToHeaders = ({
  map,
  values,
  headers,
  baseRow = [],
  skipEmptyValues = false,
}: {
  map: { header: string }[]
  values: string[]
  headers: string[]
  baseRow?: string[]
  skipEmptyValues?: boolean
}): string[] => {
  const width = Math.max(headers.length, baseRow.length)
  const row = Array.from({ length: width }, (_, index) => baseRow[index] ?? "")
  map.forEach((mapItem, index) => {
    const column = headers.indexOf(mapItem.header)
    if (column === -1) {
      return
    }
    const value = values[index] ?? ""
    if (skipEmptyValues && value === "") {
      return
    }
    row[column] = value
  })
  return row
}
