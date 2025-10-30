import { z } from "zod"
import {
  spreadsheetColumnFilterDefaultFn,
  spreadsheetColumnFilterSchema,
  spreadsheetDefaultFn,
  spreadsheetSchema,
} from "./spreadsheet"
import { StepType } from "./step-action"

export const spreadsheetClearRowSchema = spreadsheetSchema.extend({
  stepType: z.literal(StepType.clearRow),
  lookup: spreadsheetColumnFilterSchema,
})
export type SpreadsheetClearRowSchema = z.infer<
  typeof spreadsheetClearRowSchema
>

export const spreadsheetClearRowDefaultFn = (): SpreadsheetClearRowSchema => ({
  ...spreadsheetDefaultFn(),
  stepType: StepType.clearRow,
  lookup: spreadsheetColumnFilterDefaultFn(),
})
