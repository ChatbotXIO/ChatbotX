import { z } from "zod"

export const listWorksheetsRequest = z.object({
  chatbotId: z.cuid2(),
  page: z.number().optional(),
  perPage: z.number().optional(),
  spreadsheetId: z.cuid2(),
})
export type ListWorksheetsRequest = z.infer<typeof listWorksheetsRequest>

export const listWorksheetHeadersRequest = z.object({
  chatbotId: z.cuid2(),
  spreadsheetId: z.cuid2(),
  sheetName: z.string(),
})
export type ListWorksheetHeadersRequest = z.infer<
  typeof listWorksheetHeadersRequest
>
