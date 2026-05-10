import {
  buildContext,
  integrationGoogleSheetService,
} from "@chatbotx.io/business"
import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  flowVersionModel,
  spreadsheetModel,
} from "@chatbotx.io/database/schema"
import type {
  ConversationModel,
  SpreadsheetModel,
} from "@chatbotx.io/database/types"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import type {
  EdgeSchema,
  FilterMode,
  Operator,
  SpreadsheetClearRowSchema,
  SpreadsheetGetRandomRowSchema,
  SpreadsheetGetRowSchema,
  SpreadsheetSendDataSchema,
  SpreadsheetUpdateRowSchema,
} from "@chatbotx.io/flow-config"
import {
  type GoogleSheetsAuthValue,
  integration as integrationGooglesheets,
} from "@chatbotx.io/integration-google-sheets"
import { createId } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"
import { isMatchedRow } from "./operator-handler"

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
) => {
  try {
    const { headers, rows: values } = await getSheetData(props)
    const foundRow = findRows({
      headers,
      rows: values,
      lookup: props.step.lookup,
      type: findRowType.SINGLE,
    }) as string[] | null
    if (!foundRow) {
      return
    }

    await updateContactCustomFields({
      conversation: props.conversation,
      step: props.step,
      headers,
      foundRow,
    })
    await sendFlow(props, true)
  } catch (error) {
    await sendFlow(props, false)
    logger.error(error, "Error in getSpreadsheetRow")
  }
}

export const sendSpreadsheetData = async (
  props: ExecuteStepProps<SpreadsheetGetRowSchema>,
) => {
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
    await sendFlow(props, true)
  } catch (error) {
    await sendFlow(props, false)
    logger.error(error, "Error in sendSpreadsheetData")
  }
}

export const updateSpreadsheetRow = async (
  props: ExecuteStepProps<SpreadsheetGetRowSchema>,
) => {
  try {
    const { headers, rows: values } = await getSheetData(props)
    const foundRows = findRows({
      headers,
      rows: values,
      lookup: props.step.lookup,
      type: findRowType.ALL,
    }) as string[][] | null
    if (!foundRows) {
      return
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
    await sendFlow(props, true)
  } catch (error) {
    await sendFlow(props, false)
    logger.error(error, "Error in updateSpreadsheetRow")
  }
}

export const clearSpreadsheetRow = async (
  props: ExecuteStepProps<SpreadsheetGetRowSchema>,
) => {
  try {
    const { headers, rows: values } = await getSheetData(props)
    const foundRows = findRows({
      headers,
      rows: values,
      lookup: props.step.lookup,
      type: findRowType.ALL,
    }) as string[][] | null
    if (!foundRows) {
      return
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
    await sendFlow(props, true)
  } catch (error) {
    await sendFlow(props, false)
    logger.error(error, "Error in clearSpreadsheetRow")
  }
}

export const getSpreadsheetRandomRow = async (
  props: ExecuteStepProps<SpreadsheetGetRowSchema>,
) => {
  try {
    const { headers, rows: values } = await getSheetData(props)
    const foundRow = findRows({
      headers,
      rows: values,
      lookup: props.step.lookup,
      type: findRowType.RANDOM,
    }) as string[] | null
    if (!foundRow) {
      return
    }

    await updateContactCustomFields({
      conversation: props.conversation,
      step: props.step,
      headers,
      foundRow,
    })
    await sendFlow(props, true)
  } catch (error) {
    await sendFlow(props, false)
    logger.error(error, "Error in getSpreadsheetRandomRow")
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

      // Emit custom field changed event
      try {
        await emitCustomFieldChanged(
          conversation.workspaceId,
          conversation.contactId,
          mapItem.customFieldId,
          customFieldMap.get(mapItem.customFieldId) || mapItem.customFieldId,
          existing?.value || null,
          value,
        )
      } catch (error) {
        console.error("Failed to emit customFieldChanged event:", error)
      }
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

const sendFlow = async (
  {
    conversation,
    contactInbox,
    flowVersion,
    step,
  }: ExecuteStepProps<
    | SpreadsheetGetRowSchema
    | SpreadsheetSendDataSchema
    | SpreadsheetGetRandomRowSchema
    | SpreadsheetClearRowSchema
    | SpreadsheetUpdateRowSchema
  >,
  isSuccess: boolean,
) => {
  if (!flowVersion) {
    return
  }

  const currentFlowVersion = await findOrFail({
    table: flowVersionModel,
    where: {
      id: flowVersion.id,
      workspaceId: conversation.workspaceId,
    },
    message: "FlowVersion not found",
  })

  const edges = currentFlowVersion.edges || []
  const nodeId: string | undefined = isSuccess
    ? step.successNodeId
    : step.errorNodeId
  const foundEdge = (edges as EdgeSchema[]).find(
    ({ sourceHandle }) => sourceHandle === nodeId,
  )

  if (foundEdge) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        flowId: currentFlowVersion.flowId,
        nodeId: foundEdge.target,
      },
    })
  }
}
