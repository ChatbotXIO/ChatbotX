import {
  Integration,
  type IntegrationHandlerProps,
  type Oauth2AuthProps,
  type Oauth2AuthValue,
} from "@ahachat.ai/sdk"
import {
  generateAuthUrl,
  getSheetsClient,
  getToken,
  revokeToken,
} from "./client"

export const integration = new Integration<
  Oauth2AuthProps,
  Oauth2AuthValue,
  IntegrationHandlerProps<Oauth2AuthValue>
>({
  name: "googleSheets",
  actions: {
    listSheetNames: async ({ ctx, props }): Promise<string[]> => {
      const sheetsClient = getSheetsClient(ctx.integration, props.auth)
      const response = await sheetsClient.spreadsheets.get({
        spreadsheetId: props.spreadsheetId,
      })

      const sheets = response.data.sheets ?? []

      return sheets.map((sheet) => sheet.properties?.title ?? "")
    },
    listSheetHeaders: async ({ ctx, props }): Promise<string[]> => {
      const sheetsClient = getSheetsClient(ctx.integration, props.auth)
      const response = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: props.spreadsheetId,
        range: `${props.sheetName}!1:1`,
      })

      return response.data.values ? (response.data.values[0] as string[]) : []
    },
    insertRow: async ({ ctx, props }): Promise<void> => {
      const sheetsClient = getSheetsClient(ctx.integration, props.auth)
      await sheetsClient.spreadsheets.values.append({
        spreadsheetId: props.spreadsheetId,
        range: `${props.sheetName}!1:1`,
        requestBody: {
          values: [props.data],
        },
      })
    },
  },
  connect: async (props: Oauth2AuthProps) => {
    return await generateAuthUrl(props)
  },
  disconnect: async (props: Oauth2AuthValue) => {
    return await revokeToken(props)
  },
  authorize: async (props: Oauth2AuthProps) => {
    return await getToken(props)
  },
})
