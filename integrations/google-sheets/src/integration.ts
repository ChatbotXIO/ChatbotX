import {
  AuthType,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
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
  connection: {
    kind: "integration",
    strategy: "oauth_redirect",
    multiAccount: true,
    configFields: [],
    // Bypasses `generateAuthUrl`: that helper base64-JSON-encodes
    // `stateParams` for the legacy cookie flow, while the Connection OAuth
    // callback hub matches the raw `"{sessionId}.{nonce}"` state value.
    authorizeUrl: ({ credential, callbackUrl, state }) => {
      const config = credential as GoogleSheetsConfig
      return getClient({
        ...config,
        redirectUrl: callbackUrl,
      }).generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["https://www.googleapis.com/auth/spreadsheets"],
        state,
      })
    },
    exchangeCode: async ({ code, callbackUrl, credential }) => {
      const config = credential as GoogleSheetsConfig
      const tokens = await getClient({
        ...config,
        redirectUrl: callbackUrl,
      }).getToken(code)

      return {
        authType: AuthType.oauth2,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUrl: "",
        tokens: {
          accessToken: tokens.tokens.access_token || "",
          expiresAt: new Date(tokens.tokens.expiry_date ?? "").toISOString(),
          refreshToken: tokens.tokens.refresh_token ?? null,
        },
        metadata: {
          scope: tokens.tokens.scope,
        },
      } satisfies GoogleSheetsAuthValue
    },
    describe: (auth) => ({
      // Google Sheets auth does not retain a spreadsheet identifier.
      sourceId: "workspace",
      displayName: "Google Sheets",
      authExpiresAt: auth.tokens.expiresAt,
    }),
    verify: async ({ auth }) => {
      await getClient(auth).getTokenInfo(auth.tokens.accessToken)
      return { ok: true, authExpiresAt: auth.tokens.expiresAt }
    },
    // TODO(connection-phase2): refine once Google Sheets revoked-token error shape is confirmed.
    isRevokedTokenError: () => false,
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
