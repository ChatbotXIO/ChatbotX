import { z } from "zod"
import {
  spreadsheetResource,
  worksheetHeaderResource,
  worksheetResource,
} from "./resource"

export const listSpreadsheetsRequest = z.object({
  chatbotId: z.bigint(),
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
  chatbotId: z.bigint(),
  page: z.number().optional(),
  perPage: z.number().optional(),
  spreadsheetId: z.bigint(),
})
export type ListWorksheetsRequest = z.infer<typeof listWorksheetsRequest>

export const listWorksheetsResponse = z.object({
  data: z.array(worksheetResource),
})
export type ListWorksheetsResponse = z.infer<typeof listWorksheetsResponse>

export const listWorksheetHeadersRequest = z.object({
  chatbotId: z.bigint(),
  spreadsheetId: z.bigint(),
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
