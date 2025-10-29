import { z } from "zod"
import {
  spreadsheetColumnFilterDefaultFn,
  spreadsheetColumnFilterSchema,
  spreadsheetDefaultFn,
  spreadsheetMappingSchema,
  spreadsheetSchema,
} from "./spreadsheet"
import { StepType } from "./step-action"

export const spreadsheetGetRowSchema = spreadsheetSchema.extend({
  stepType: z.literal(StepType.SPREADSHEET_GET_ROW),
  lookup: spreadsheetColumnFilterSchema,
  map: z.array(spreadsheetMappingSchema).min(1),
})
export type SpreadsheetGetRowSchema = z.infer<typeof spreadsheetGetRowSchema>

export const spreadsheetGetRowDefaultFn = (): SpreadsheetGetRowSchema => ({
  ...spreadsheetDefaultFn(),
  stepType: StepType.SPREADSHEET_GET_ROW,
  lookup: spreadsheetColumnFilterDefaultFn(),
  map: [],
})
