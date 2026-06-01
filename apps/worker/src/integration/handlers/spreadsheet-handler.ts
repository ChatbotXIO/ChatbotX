import {
  buildContext,
  integrationGoogleSheetService,
} from "@chatbotx.io/business"
import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  spreadsheetModel,
} from "@chatbotx.io/database/schema"
import type {
  ConversationModel,
  SpreadsheetModel,
} from "@chatbotx.io/database/types"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import type {
  FilterMode,
  Operator,
  SpreadsheetGetRowSchema,
} from "@chatbotx.io/flow-config"
import {
  type GoogleSheetsAuthValue,
  integration as integrationGooglesheets,
} from "@chatbotx.io/integration-google-sheets"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"
import { isMatchedRow } from "./operator-handler"
import type { ExecuteStepResult } from "./step"

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
  await findOrFail({
    table: spreadsheetModel,
    where: {
      id,
      workspaceId,
    },
    message: "Spreadsheet not found",
  })

const getSheetData = async ({
  conversation,
  step,
}: ExecuteStepProps<SpreadsheetGetRowSchema>) => {
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
      lookup: props.step.lookup,
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
    return {
      status: "error",
      errorMessage: "Failed to get spreadsheet row",
      result: null,
    }
  }
}

export const sendSpreadsheetData = async (
  props: ExecuteStepProps<SpreadsheetGetRowSchema>,
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

    const data: string[] = []
    for (const mapItem of props.step.map) {
      let value = ""
      if (mapItem.customFieldId) {
        const contactCustomField =
          await db.query.contactCustomFieldModel.findFirst({
            where: {
              contactId: props.conversation.contactId,
              customFieldId: mapItem.customFieldId,
            },
          })
        value = contactCustomField?.value || ""
      }
      data.push(value)
    }

    const ctx = await buildContext({
      workspaceId: props.conversation.workspaceId,
      integrationType: "googleSheets",
      integration: {
        ...integrationRow,
        auth: integrationRow.auth as GoogleSheetsAuthValue,
      },
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
    return {
      status: "error",
      errorMessage: "Failed to send spreadsheet data",
      result: null,
    }
  }
}

export const updateSpreadsheetRow = async (
  props: ExecuteStepProps<SpreadsheetGetRowSchema>,
): Promise<ExecuteStepResult> => {
  try {
    const { headers, rows: values } = await getSheetData(props)
    const foundRows = findRows({
      headers,
      rows: values,
      lookup: props.step.lookup,
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

    const data: string[] = []
    for (const mapItem of props.step.map) {
      let value = ""
      if (mapItem.customFieldId) {
        const contactCustomField =
          await db.query.contactCustomFieldModel.findFirst({
            where: {
              contactId: props.conversation.contactId,
              customFieldId: mapItem.customFieldId,
            },
          })
        value = contactCustomField?.value || ""
      }
      data.push(value)
    }

    const ctx = await buildContext({
      workspaceId: props.conversation.workspaceId,
      integrationType: "googleSheets",
      integration: {
        ...integrationRow,
        auth: integrationRow.auth as GoogleSheetsAuthValue,
      },
    })
    for (const foundRow of foundRows) {
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
    return {
      status: "error",
      errorMessage: "Failed to update spreadsheet row",
      result: null,
    }
  }
}

export const clearSpreadsheetRow = async (
  props: ExecuteStepProps<SpreadsheetGetRowSchema>,
): Promise<ExecuteStepResult> => {
  try {
    const { headers, rows: values } = await getSheetData(props)
    const foundRows = findRows({
      headers,
      rows: values,
      lookup: props.step.lookup,
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
    return {
      status: "error",
      errorMessage: "Failed to clear spreadsheet row",
      result: null,
    }
  }
}

export const getSpreadsheetRandomRow = async (
  props: ExecuteStepProps<SpreadsheetGetRowSchema>,
): Promise<ExecuteStepResult> => {
  try {
    const { headers, rows: values } = await getSheetData(props)
    const foundRow = findRows({
      headers,
      rows: values,
      lookup: props.step.lookup,
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
  step: SpreadsheetGetRowSchema
  headers: string[]
  foundRow: string[]
}) => {
  // Fetch custom field names for event emission
  const customFieldIds = step.map
    .map((m) => m.customFieldId)
    .filter(Boolean) as string[]
  const customFields = await db.query.customFieldModel.findMany({
    where: {
      id: { in: customFieldIds },
    },
    columns: { id: true, name: true },
  })
  const customFieldMap = new Map(customFields.map((f) => [f.id, f.name]))

  for (const mapItem of step.map) {
    const headerIndex = headers.indexOf(mapItem.header)
    if (headerIndex !== -1 && mapItem.customFieldId) {
      const value = foundRow[headerIndex]

      // Get existing value before update
      const existing = await db.query.contactCustomFieldModel.findFirst({
        where: {
          contactId: conversation.contactId,
          customFieldId: mapItem.customFieldId,
        },
        columns: { value: true },
      })

      await db
        .insert(contactCustomFieldModel)
        .values({
          id: createId(),
          contactId: conversation.contactId,
          customFieldId: mapItem.customFieldId,
          value,
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
        mapItem.customFieldId,
        customFieldMap.get(mapItem.customFieldId) || mapItem.customFieldId,
        existing?.value || null,
        value,
      )
    }
  }
}

const getRandomRow = (rows: string[][]): string[] | null => {
  if (!rows.length) {
    return null
  }
  const i = Math.floor(Math.random() * rows.length)
  return rows[i]
}
