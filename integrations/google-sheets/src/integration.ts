import {
  googleOAuthConnection,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  isGoogleRevokedError,
  probeVerify,
  SdkException,
} from "@chatbotx.io/sdk"
import { generateAuthUrl, getClient, getSheetsClient } from "./client"
import { addGoogleSheetsIdentity } from "./connection-auth"
import { GOOGLE_SHEETS_SCOPES } from "./constants"
import { callbackHandler } from "./handlers/callback"
import type {
  GoogleSheetsActions,
  GoogleSheetsAuthValue,
  GoogleSheetsConfig,
} from "./schemas"

const googleConnection = googleOAuthConnection<
  GoogleSheetsConfig,
  GoogleSheetsAuthValue
>({
  getClient,
  scopes: GOOGLE_SHEETS_SCOPES,
  mapAuth: addGoogleSheetsIdentity,
})

const config: IntegrationDefinition<
  GoogleSheetsConfig,
  GoogleSheetsAuthValue,
  GoogleSheetsActions
> = {
  name: "googleSheets",
  connection: {
    kind: "integration",
    strategy: "oauth_redirect",
    multiAccount: false,
    configFields: [],
    ...googleConnection,
    describe: (auth) => ({
      sourceId: auth.metadata.accountId,
      displayName: auth.metadata.email ?? "Google Sheets",
      authExpiresAt: auth.tokens.expiresAt,
    }),
    verify: async ({ auth }) =>
      await probeVerify(
        async () => {
          const client = getClient(auth)
          const accessToken = await client.getAccessToken()
          await client.getTokenInfo(
            accessToken.token ?? auth.tokens.accessToken,
          )
        },
        {
          label: "Google Sheets credentials",
          expiresAt: auth.tokens.expiresAt,
          isRevoked: isGoogleRevokedError,
        },
      ),
    isRevokedTokenError: isGoogleRevokedError,
  },
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
    getSheetValues: async ({ ctx, props }): Promise<string[][]> => {
      const sheetsClient = getSheetsClient(ctx.auth)
      const response = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: props.spreadsheetId,
        range: props.sheetName,
      })
      return response.data.values ? (response.data.values as string[][]) : []
    },
    insertRow: async ({ ctx, props }): Promise<void> => {
      const sheetsClient = getSheetsClient(ctx.auth)
      await sheetsClient.spreadsheets.values.append({
        spreadsheetId: props.spreadsheetId,
        range: props.sheetName,
        // RAW stores values exactly as provided so contact data (phone numbers
        // like "+84...", long IDs, leading-zero codes) is not reinterpreted by
        // Sheets, and untrusted values cannot inject formulas.
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [props.data],
        },
      })
    },
    updateRow: async ({ ctx, props }): Promise<void> => {
      const sheetsClient = getSheetsClient(ctx.auth)
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: props.spreadsheetId,
        range: `${props.sheetName}!A${props.rowIndex + 1}`,
        // RAW stores values exactly as provided so contact data (phone numbers
        // like "+84...", long IDs, leading-zero codes) is not reinterpreted by
        // Sheets, and untrusted values cannot inject formulas.
        valueInputOption: "RAW",
        requestBody: {
          values: [props.data],
        },
      })
    },
    clearRow: async ({ ctx, props }): Promise<void> => {
      const sheetsClient = getSheetsClient(ctx.auth)
      await sheetsClient.spreadsheets.values.clear({
        spreadsheetId: props.spreadsheetId,
        range: `${props.sheetName}!A${props.rowIndex + 1}:Z${props.rowIndex + 1}`,
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
