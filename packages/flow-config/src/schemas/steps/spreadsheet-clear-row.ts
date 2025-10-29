import { z } from "zod"
import {
  spreadsheetColumnFilterDefaultFn,
  spreadsheetColumnFilterSchema,
  spreadsheetDefaultFn,
  spreadsheetSchema,
} from "./spreadsheet"
import { StepType } from "./step-action"

export const spreadsheetClearRowSchema = spreadsheetSchema.extend({
  stepType: z.literal(StepType.SPREADSHEET_CLEAR_ROW),
  lookup: spreadsheetColumnFilterSchema,
})
export type SpreadsheetClearRowSchema = z.infer<
  typeof spreadsheetClearRowSchema
>

export const spreadsheetClearRowDefaultFn = (): SpreadsheetClearRowSchema => ({
  ...spreadsheetDefaultFn(),
  stepType: StepType.SPREADSHEET_CLEAR_ROW,
  lookup: spreadsheetColumnFilterDefaultFn(),
})
