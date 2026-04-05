import {
  createSelectSchema,
  spreadsheetModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const spreadsheetResource = createSelectSchema(spreadsheetModel, {
  id: z.string(),
  workspaceId: z.string(),
})
export type SpreadsheetResource = z.infer<typeof spreadsheetResource>

export const worksheetResource = z.string()
export type WorksheetResource = z.infer<typeof worksheetResource>

export const worksheetHeaderResource = z.string()
export type WorksheetHeaderResource = z.infer<typeof worksheetHeaderResource>
