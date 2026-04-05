import type {
  Context,
  Handler,
  Oauth2AuthValue,
  Oauth2Config,
} from "@chatbotx.io/sdk"

export type GoogleSheetsConfig = Oauth2Config & {
  stateParams?: {
    workspaceId: string
    referer: string
  }
}

export type GoogleSheetsAuthValue = Oauth2AuthValue & {
  metadata: {
    scope?: string
  }
}

export type GoogleSheetsActions = {
  listSheetNames: Handler<
    { ctx: Context<GoogleSheetsAuthValue>; props: { spreadsheetId: string } },
    string[]
  >
  listSheetHeaders: Handler<
    {
      ctx: Context<GoogleSheetsAuthValue>
      props: { spreadsheetId: string; sheetName: string }
    },
    string[]
  >
  getSheetValues: Handler<
    {
      ctx: Context<GoogleSheetsAuthValue>
      props: { spreadsheetId: string; sheetName: string }
    },
    string[][]
  >
  insertRow: Handler<
    {
      ctx: Context<GoogleSheetsAuthValue>
      props: { spreadsheetId: string; sheetName: string; data: string[] }
    },
    void
  >
  updateRow: Handler<
    {
      ctx: Context<GoogleSheetsAuthValue>
      props: {
        spreadsheetId: string
        sheetName: string
        rowIndex: number
        data: string[]
      }
    },
    void
  >
  clearRow: Handler<
    {
      ctx: Context<GoogleSheetsAuthValue>
      props: { spreadsheetId: string; sheetName: string; rowIndex: number }
    },
    void
  >
}
