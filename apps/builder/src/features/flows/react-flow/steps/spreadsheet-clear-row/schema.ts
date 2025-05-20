import { StepType } from "@aha.chat/flow-config"
import { z } from "zod"
import {
  spreadsheetColumnFilterDefaultFn,
  spreadsheetColumnFilterSchema,
  spreadsheetDefaultFn,
  spreadsheetSchema,
} from "../spreadsheet/schema"

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
