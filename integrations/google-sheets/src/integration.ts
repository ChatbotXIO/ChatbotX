import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { generateAuthUrl, getClient, getSheetsClient } from "./client"
import { callbackHandler } from "./handlers/callback"
import type {
  GoogleSheetsActions,
  GoogleSheetsAuthValue,
  GoogleSheetsConfig,
} from "./schemas"

const config: IntegrationDefinition<
  GoogleSheetsConfig,
  GoogleSheetsAuthValue,
  GoogleSheetsActions
> = {
  name: "googleSheets",
  actions: {
    listSheetNames: async ({ ctx, props }): Promise<string[]> => {
      const sheetsClient = getSheetsClient(ctx.auth)
      const response = await sheetsClient.spreadsheets.get({
        spreadsheetId: props.spreadsheetId,
      })

      const sheets = response.data.sheets ?? []

      return sheets.map((sheet) => sheet.properties?.title ?? "")
    },
    listSheetHeaders: async ({ ctx, props }): Promise<string[]> => {
      const sheetsClient = getSheetsClient(ctx.auth)
      const response = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: props.spreadsheetId,
        range: `${props.sheetName}!1:1`,
      })

      return response.data.values ? (response.data.values[0] as string[]) : []
    },
    insertRow: async ({ ctx, props }): Promise<void> => {
      const sheetsClient = getSheetsClient(ctx.auth)
      await sheetsClient.spreadsheets.values.append({
        spreadsheetId: props.spreadsheetId,
        range: `${props.sheetName}!1:1`,
        requestBody: {
          values: [props.data],
        },
      })
    },
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const method = segments.pop()

    switch (method) {
      case HandleRequestType.callback:
        return await callbackHandler(props)
      case HandleRequestType.generateAuthUrl:
        return await generateAuthUrl(props.config)
      default:
        throw new SdkException(
          `Handler: ${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: async (props: GoogleSheetsAuthValue): Promise<void> => {
    const client = getClient(props)
    await client.revokeToken(props.tokens.accessToken)
  },
}

export const integration = new Integration(config)
