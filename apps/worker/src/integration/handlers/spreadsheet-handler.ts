import { db, findOrFail } from "@aha.chat/database/client"
import {
  contactCustomFieldModel,
  flowVersionModel,
  integrationGoogleSheetsModel,
  spreadsheetModel,
} from "@aha.chat/database/schema"
import type {
  ConversationModel,
  FlowVersionModel,
  IntegrationGoogleSheetsModel,
  SpreadsheetModel,
} from "@aha.chat/database/types"
import type {
  EdgeSchema,
  FilterMode,
  Operator,
  SpreadsheetClearRowSchema,
  SpreadsheetGetRandomRowSchema,
  SpreadsheetGetRowSchema,
  SpreadsheetSendDataSchema,
  SpreadsheetUpdateRowSchema,
} from "@aha.chat/flow-config"
import {
  type GoogleSheetsAuthValue,
  integration as integrationGooglesheets,
} from "@aha.chat/integration-google-sheets"
import { SdkException } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { emitCustomFieldChanged } from "@chatbotx/events"
import { createId } from "@paralleldrive/cuid2"
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
  chatbotId,
}: {
  id: string
  chatbotId: string
}): Promise<SpreadsheetModel> =>
  await findOrFail<SpreadsheetModel>(
    spreadsheetModel,
    {
      id,
      chatbotId,
    },
    "Spreadsheet not found",
  )

const getGoogleSheetsIntegration = async (chatbotId: string) =>
  await findOrFail<IntegrationGoogleSheetsModel>(
    integrationGoogleSheetsModel,
    {
      chatbotId,
    },
    "Google Sheets integration not found",
  )

const getSheetData = async ({
  conversation,
  step,
}: ExecuteStepProps<SpreadsheetGetRowSchema>) => {
  const auth = await getGoogleSheetAuth(conversation.chatbotId)
  const worksheet = await getWorksheet({
    id: step.spreadsheetId,
    chatbotId: conversation.chatbotId,
  })

  const headers = await integrationGooglesheets.actions.listSheetHeaders({
    ctx: {
      auth,
    },
    props: {
      spreadsheetId: worksheet.spreadsheetId,
      sheetName: step.sheetName,
    },
  })
  const values = await integrationGooglesheets.actions.getSheetValues({
    ctx: {
      auth,
    },
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

const getGoogleSheetAuth = async (chatbotId: string) => {
  const googleSheetsIntegration = await getGoogleSheetsIntegration(chatbotId)
  if (!googleSheetsIntegration.auth) {
    throw new SdkException("Google Sheets integration auth is missing")
  }
  return googleSheetsIntegration.auth as GoogleSheetsAuthValue
}

export const sendSpreadsheetData = async (
  props: ExecuteStepProps<SpreadsheetGetRowSchema>,
) => {
  try {
    const auth = await getGoogleSheetAuth(props.conversation.chatbotId)
    const worksheet = await getWorksheet({
      id: props.step.spreadsheetId,
      chatbotId: props.conversation.chatbotId,
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

    await integrationGooglesheets.actions.insertRow({
      ctx: {
        auth,
      },
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

    const auth = await getGoogleSheetAuth(props.conversation.chatbotId)
    const worksheet = await getWorksheet({
      id: props.step.spreadsheetId,
      chatbotId: props.conversation.chatbotId,
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

    for (const foundRow of foundRows) {
      await integrationGooglesheets.actions.updateRow({
        ctx: {
          auth,
        },
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

    const auth = await getGoogleSheetAuth(props.conversation.chatbotId)
    const worksheet = await getWorksheet({
      id: props.step.spreadsheetId,
      chatbotId: props.conversation.chatbotId,
    })

    for (const foundRow of foundRows) {
      await integrationGooglesheets.actions.clearRow({
        ctx: {
          auth,
        },
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
          conversation.chatbotId,
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

  const currentFlowVersion = await findOrFail<FlowVersionModel>(
    flowVersionModel,
    {
      id: flowVersion.id,
      chatbotId: conversation.chatbotId,
    },
    "FlowVersion not found",
  )

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
        conversationId: conversation.id,
        flowId: currentFlowVersion.flowId,
        nodeId: foundEdge.target,
      },
    })
  }
}
