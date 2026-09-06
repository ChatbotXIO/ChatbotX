import { useQuery } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc/query"

/**
 * Header row of one worksheet, shared by the column select and the
 * custom-field mapping so both read the same query cache entry. Skips the
 * request until a spreadsheet and sheet are both chosen.
 */
export const useWorksheetHeaders = (
  workspaceId: string,
  spreadsheetId: string | undefined,
  sheetName: string | undefined,
) =>
  useQuery(
    orpc.spreadsheetsAPI.listWorksheetHeadersAuthenticatedAPI.queryOptions({
      input: {
        workspaceId,
        spreadsheetId: spreadsheetId ?? "",
        sheetName: sheetName ?? "",
      },
      enabled: Boolean(spreadsheetId && sheetName),
    }),
  )
