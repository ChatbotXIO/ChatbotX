import { z } from "zod"
import {
  spreadsheetColumnFilterDefaultFn,
  spreadsheetColumnFilterSchema,
  spreadsheetDefaultFn,
  spreadsheetSchema,
} from "./spreadsheet"
import { stepTypes } from "./step-action"

export const spreadsheetClearRowSchema = spreadsheetSchema.extend({
  stepType: z.literal(stepTypes.enum.spreadsheetClearRow),
  lookup: spreadsheetColumnFilterSchema,
})
export type SpreadsheetClearRowSchema = z.infer<
  typeof spreadsheetClearRowSchema
>

export const spreadsheetClearRowDefaultFn = (): SpreadsheetClearRowSchema => ({
  ...spreadsheetDefaultFn(),
  stepType: stepTypes.enum.spreadsheetClearRow,
  lookup: spreadsheetColumnFilterDefaultFn(),
})
