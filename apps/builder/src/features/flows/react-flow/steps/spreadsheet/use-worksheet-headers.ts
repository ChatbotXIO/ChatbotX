import { client } from "@/lib/orpc/orpc"
import { useClientQuery } from "@/lib/swr"

/**
 * Header row of one worksheet, shared by the column select and the
 * custom-field mapping so both read the same SWR cache entry. Skips the
 * request until a spreadsheet and sheet are both chosen.
 */
export const useWorksheetHeaders = (
  workspaceId: string,
  spreadsheetId: string | undefined,
  sheetName: string | undefined,
) =>
  useClientQuery(
    spreadsheetId && sheetName
      ? ([
          "spreadsheetsAPI.listWorksheetHeadersAuthenticatedAPI",
          workspaceId,
          spreadsheetId,
          sheetName,
        ] as const)
      : null,
    () =>
      client.spreadsheetsAPI.listWorksheetHeadersAuthenticatedAPI({
        workspaceId,
        spreadsheetId: spreadsheetId ?? "",
        sheetName: sheetName ?? "",
      }),
  )
