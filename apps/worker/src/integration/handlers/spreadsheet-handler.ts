import {
  botFieldService,
  buildContext,
  contactCustomFieldService,
  integrationGoogleSheetService,
  spreadsheetService,
} from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import type {
  ConversationModel,
  SpreadsheetModel,
} from "@chatbotx.io/database/types"
import {
  FieldReferenceKind,
  type FilterMode,
  type Operator,
  parseFieldReference,
  type SpreadsheetClearRowSchema,
  type SpreadsheetGetRandomRowSchema,
  type SpreadsheetGetRowSchema,
  type SpreadsheetSchema,
  type SpreadsheetSendDataSchema,
  type SpreadsheetUpdateRowSchema,
} from "@chatbotx.io/flow-config"
import {
  type GoogleSheetsAuthValue,
  integration as integrationGooglesheets,
} from "@chatbotx.io/integration-google-sheets"
import {
  SourceTimezoneStrategy,
  TemporalInputParsing,
} from "@chatbotx.io/utils/datetime"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"
import { isMatchedRow } from "./operator-handler"
import { resolveSpreadsheetLookup } from "./spreadsheet-lookup-values"
import {
  alignWriteValuesToHeaders,
  buildSpreadsheetWriteData,
} from "./spreadsheet-write-values"
import type { ExecuteStepResult } from "./step"

/**
 * Every step in this file fails the same way — one Google Sheets call, one
 * conversation in scope — so the attribution is identical at all five catch
 * sites. Kept local rather than generic: the provider is a constant here.
 */
const logGoogleSheetsError = (
  conversation: Pick<ConversationModel, "workspaceId" | "contactId">,
  error: unknown,
) =>
  logProviderError({
    provider: "google-sheets",
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    error,
  })

const findRowType = {
  SINGLE: "single",
  ALL: "all",
  RANDOM: "random",
}
type FindRowType = (typeof findRowType)[keyof typeof findRowType]

const getWorksheet = async ({
  id,
  workspaceId,
}: {
  id: string
  workspaceId: string
}): Promise<SpreadsheetModel> =>
  await spreadsheetService.findByWorkspaceIdOrFail({ id, workspaceId })

const getSheetData = async ({
  conversation,
  step,
}: ExecuteStepProps<SpreadsheetSchema>) => {
  const integrationRow =
    await integrationGoogleSheetService.findByWorkspaceIdOrFail(
      conversation.workspaceId,
    )
  const worksheet = await getWorksheet({
    id: step.spreadsheetId,
    workspaceId: conversation.workspaceId,
  })

  const ctx = await buildContext({
    workspaceId: conversation.workspaceId,
    integrationType: "googleSheets",
    integration: {
      ...integrationRow,
      auth: integrationRow.auth as GoogleSheetsAuthValue,
    },
  })

  const headers = await integrationGooglesheets.runAction("listSheetHeaders", {
    ctx,
    props: {
      spreadsheetId: worksheet.spreadsheetId,
      sheetName: step.sheetName,
    },
  })
  const values = await integrationGooglesheets.runAction("getSheetValues", {
    ctx,
    props: {
      spreadsheetId: worksheet.spreadsheetId,
      sheetName: step.sheetName,
    },
  })
  return {
    headers,
    rows: values,
  }
}

const findRows = ({
  headers,
  rows,
  lookup,
  type,
}: {
  headers: string[]
  rows: string[][]
  lookup: {
    mode: FilterMode
    conditions: { value: string; column: string; operator: OperatorType }[]
  }
  type: FindRowType
}): string[][] | string[] | null => {
  const matched: string[][] = []
  for (const row of rows) {
    if (isMatchedRow(headers, row, lookup)) {
      matched.push(row)
      if (type === findRowType.SINGLE) {
        return row
      }
    }
  }
  if (matched.length === 0) {
    return null
  }
  return type === findRowType.RANDOM ? getRandomRow(matched) : matched
}

type OperatorType = (typeof Operator)[keyof typeof Operator]

export const getSpreadsheetRow = async (
  props: ExecuteStepProps<SpreadsheetGetRowSchema>,
): Promise<ExecuteStepResult> => {
  try {
    const { headers, rows: values } = await getSheetData(props)
    const foundRow = findRows({
      headers,
      rows: values,
      lookup: await resolveSpreadsheetLookup(props),
      type: findRowType.SINGLE,
    }) as string[] | null
    if (!foundRow) {
      return { status: "error", errorMessage: "Row not found", result: null }
    }

    await updateContactCustomFields({
      conversation: props.conversation,
      step: props.step,
      headers,
      foundRow,
    })
    return { status: "success", result: null }
  } catch (error) {
    logger.error(error, "Error in getSpreadsheetRow")
    await logGoogleSheetsError(props.conversation, error)
    return {
      status: "error",
      errorMessage: "Failed to get spreadsheet row",
      result: null,
    }
  }
}

export const sendSpreadsheetData = async (
  props: ExecuteStepProps<SpreadsheetSendDataSchema>,
): Promise<ExecuteStepResult> => {
  try {
    const integrationRow =
      await integrationGoogleSheetService.findByWorkspaceIdOrFail(
        props.conversation.workspaceId,
      )
    const worksheet = await getWorksheet({
      id: props.step.spreadsheetId,
      workspaceId: props.conversation.workspaceId,
    })

    const ctx = await buildContext({
      workspaceId: props.conversation.workspaceId,
      integrationType: "googleSheets",
      integration: {
        ...integrationRow,
        auth: integrationRow.auth as GoogleSheetsAuthValue,
      },
    })
    const headers = await integrationGooglesheets.runAction(
      "listSheetHeaders",
      {
        ctx,
        props: {
          spreadsheetId: worksheet.spreadsheetId,
          sheetName: props.step.sheetName,
        },
      },
    )
    const data = alignWriteValuesToHeaders({
      map: props.step.map,
      values: await buildSpreadsheetWriteData(props),
      headers,
    })
    await integrationGooglesheets.runAction("insertRow", {
      ctx,
      props: {
        spreadsheetId: worksheet.spreadsheetId,
        sheetName: props.step.sheetName,
        data,
      },
    })
    return { status: "success", result: null }
  } catch (error) {
    logger.error(error, "Error in sendSpreadsheetData")
    await logGoogleSheetsError(props.conversation, error)
    return {
      status: "error",
      errorMessage: "Failed to send spreadsheet data",
      result: null,
    }
  }
}

export const updateSpreadsheetRow = async (
  props: ExecuteStepProps<SpreadsheetUpdateRowSchema>,
): Promise<ExecuteStepResult> => {
  try {
    const { headers, rows: values } = await getSheetData(props)
    const foundRows = findRows({
      headers,
      rows: values,
      lookup: await resolveSpreadsheetLookup(props),
      type: findRowType.ALL,
    }) as string[][] | null
    if (!foundRows) {
      return { status: "error", errorMessage: "No rows found", result: null }
    }

    const integrationRow =
      await integrationGoogleSheetService.findByWorkspaceIdOrFail(
        props.conversation.workspaceId,
      )
    const worksheet = await getWorksheet({
      id: props.step.spreadsheetId,
      workspaceId: props.conversation.workspaceId,
    })

    const resolvedValues = await buildSpreadsheetWriteData(props)

    const ctx = await buildContext({
      workspaceId: props.conversation.workspaceId,
      integrationType: "googleSheets",
      integration: {
        ...integrationRow,
        auth: integrationRow.auth as GoogleSheetsAuthValue,
      },
    })
    for (const foundRow of foundRows) {
      // Seed from the existing row so unmapped columns keep their value, and
      // skip empty values so a blank Value input leaves the cell untouched
      // instead of clearing it.
      const data = alignWriteValuesToHeaders({
        map: props.step.map,
        values: resolvedValues,
        headers,
        baseRow: foundRow,
        skipEmptyValues: true,
      })
      await integrationGooglesheets.runAction("updateRow", {
        ctx,
        props: {
          spreadsheetId: worksheet.spreadsheetId,
          sheetName: props.step.sheetName,
          rowIndex: values.indexOf(foundRow),
          data,
        },
      })
    }
    return { status: "success", result: null }
  } catch (error) {
    logger.error(error, "Error in updateSpreadsheetRow")
    await logGoogleSheetsError(props.conversation, error)
    return {
      status: "error",
      errorMessage: "Failed to update spreadsheet row",
      result: null,
    }
  }
}

export const clearSpreadsheetRow = async (
  props: ExecuteStepProps<SpreadsheetClearRowSchema>,
): Promise<ExecuteStepResult> => {
  try {
    const { headers, rows: values } = await getSheetData(props)
    const foundRows = findRows({
      headers,
      rows: values,
      lookup: await resolveSpreadsheetLookup(props),
      type: findRowType.ALL,
    }) as string[][] | null
    if (!foundRows) {
      return { status: "error", errorMessage: "No rows found", result: null }
    }

    const integrationRow =
      await integrationGoogleSheetService.findByWorkspaceIdOrFail(
        props.conversation.workspaceId,
      )
    const worksheet = await getWorksheet({
      id: props.step.spreadsheetId,
      workspaceId: props.conversation.workspaceId,
    })

    const ctx = await buildContext({
      workspaceId: props.conversation.workspaceId,
      integrationType: "googleSheets",
      integration: {
        ...integrationRow,
        auth: integrationRow.auth as GoogleSheetsAuthValue,
      },
    })
    for (const foundRow of foundRows) {
      await integrationGooglesheets.runAction("clearRow", {
        ctx,
        props: {
          spreadsheetId: worksheet.spreadsheetId,
          sheetName: props.step.sheetName,
          rowIndex: values.indexOf(foundRow),
        },
      })
    }
    return { status: "success", result: null }
  } catch (error) {
    logger.error(error, "Error in clearSpreadsheetRow")
    await logGoogleSheetsError(props.conversation, error)
    return {
      status: "error",
      errorMessage: "Failed to clear spreadsheet row",
      result: null,
    }
  }
}

export const getSpreadsheetRandomRow = async (
  props: ExecuteStepProps<SpreadsheetGetRandomRowSchema>,
): Promise<ExecuteStepResult> => {
  try {
    const { headers, rows: values } = await getSheetData(props)
    const foundRow = findRows({
      headers,
      rows: values,
      lookup: await resolveSpreadsheetLookup(props),
      type: findRowType.RANDOM,
    }) as string[] | null
    if (!foundRow) {
      return { status: "error", errorMessage: "No rows found", result: null }
    }

    await updateContactCustomFields({
      conversation: props.conversation,
      step: props.step,
      headers,
      foundRow,
    })
    return { status: "success", result: null }
  } catch (error) {
    logger.error(error, "Error in getSpreadsheetRandomRow")
    await logGoogleSheetsError(props.conversation, error)
    return {
      status: "error",
      errorMessage: "Failed to get random spreadsheet row",
      result: null,
    }
  }
}

const updateContactCustomFields = async ({
  conversation,
  step,
  headers,
  foundRow,
}: {
  conversation: ConversationModel
  step: SpreadsheetGetRowSchema | SpreadsheetGetRandomRowSchema
  headers: string[]
  foundRow: string[]
}) => {
  const entries = step.map.flatMap((mapItem) => {
    const headerIndex = headers.indexOf(mapItem.header)
    if (headerIndex === -1 || !mapItem.customFieldId) {
      return []
    }

    return [
      {
        customFieldId: mapItem.customFieldId,
        value: foundRow[headerIndex] ?? "",
      },
    ]
  })

  if (entries.length === 0) {
    return
  }

  // Account Fields (`bot_field:<id>` tokens) don't live in
  // ContactCustomField, so they can't ride `setValues`'s batched write —
  // route each to `botFieldService.updateByKey` individually. A per-entry
  // try/catch keeps one bad/deleted bot field from failing the whole step or
  // blocking the real custom fields in the same mapping.
  const customFieldEntries: { customFieldId: string; value: string }[] = []
  for (const entry of entries) {
    const reference = parseFieldReference(entry.customFieldId)
    if (reference.kind !== FieldReferenceKind.botField) {
      customFieldEntries.push(entry)
      continue
    }

    try {
      await botFieldService.updateByKey({
        workspaceId: conversation.workspaceId,
        key: reference.id,
        data: { value: entry.value },
      })
    } catch (error: unknown) {
      logger.warn(
        {
          err: error,
          workspaceId: conversation.workspaceId,
          botFieldId: reference.id,
        },
        "Failed to write spreadsheet value to bot field; skipping entry",
      )
    }
  }

  if (customFieldEntries.length === 0) {
    return
  }

  await contactCustomFieldService.setValues({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    fields: customFieldEntries,
    // Sheet cells arrive as locale display strings or unix numbers, not ISO.
    // Anchor naive values to the workspace clock and skip the contact lookup.
    temporalInputParsing: TemporalInputParsing.Lenient,
    sourceTimezoneStrategy: SourceTimezoneStrategy.Workspace,
  })
}

const getRandomRow = (rows: string[][]): string[] | null => {
  if (!rows.length) {
    return null
  }
  const i = Math.floor(Math.random() * rows.length)
  return rows[i]
}
