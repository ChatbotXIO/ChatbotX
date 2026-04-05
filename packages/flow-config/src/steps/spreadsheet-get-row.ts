import { z } from "zod"
import {
  spreadsheetColumnFilterDefaultFn,
  spreadsheetColumnFilterSchema,
  spreadsheetDefaultFn,
  spreadsheetMappingSchema,
  spreadsheetSchema,
} from "./spreadsheet"
import { stepTypes } from "./step-action"

export const spreadsheetGetRowSchema = spreadsheetSchema.extend({
  stepType: z.literal(stepTypes.enum.spreadsheetGetRow),
  lookup: spreadsheetColumnFilterSchema,
  map: z.array(spreadsheetMappingSchema).min(1),
})
export type SpreadsheetGetRowSchema = z.infer<typeof spreadsheetGetRowSchema>

export const spreadsheetGetRowDefaultFn = (): SpreadsheetGetRowSchema => ({
  ...spreadsheetDefaultFn(),
  stepType: stepTypes.enum.spreadsheetGetRow,
  lookup: spreadsheetColumnFilterDefaultFn(),
  map: [],
})
