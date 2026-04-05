import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  spreadsheetResource,
  worksheetHeaderResource,
  worksheetResource,
} from "./resource"

export const listSpreadsheetsRequest = z.object({
  workspaceId: zodBigintAsString(),
  page: z.number().optional(),
  perPage: z.number().optional(),
  name: z.string().optional(),
})
export type ListSpreadsheetsRequest = z.infer<typeof listSpreadsheetsRequest>

export const listSpreadsheetsResponse = z.object({
  data: z.array(spreadsheetResource),
  pageCount: z.number(),
})
export type ListSpreadsheetsResponse = z.infer<typeof listSpreadsheetsResponse>

export const listWorksheetsRequest = z.object({
  workspaceId: zodBigintAsString(),
  page: z.number().optional(),
  perPage: z.number().optional(),
  spreadsheetId: zodBigintAsString(),
})
export type ListWorksheetsRequest = z.infer<typeof listWorksheetsRequest>

export const listWorksheetsResponse = z.object({
  data: z.array(worksheetResource),
})
export type ListWorksheetsResponse = z.infer<typeof listWorksheetsResponse>

export const listWorksheetHeadersRequest = z.object({
  workspaceId: zodBigintAsString(),
  spreadsheetId: zodBigintAsString(),
  sheetName: z.string(),
})
export type ListWorksheetHeadersRequest = z.infer<
  typeof listWorksheetHeadersRequest
>

export const listWorksheetHeadersResponse = z.object({
  data: z.array(worksheetHeaderResource),
})
export type ListWorksheetHeadersResponse = z.infer<
  typeof listWorksheetHeadersResponse
>
