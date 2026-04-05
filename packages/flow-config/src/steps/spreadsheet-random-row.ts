import { z } from "zod"
import {
  spreadsheetColumnFilterDefaultFn,
  spreadsheetColumnFilterSchema,
  spreadsheetDefaultFn,
  spreadsheetMappingSchema,
  spreadsheetSchema,
} from "./spreadsheet"
import { stepTypes } from "./step-action"

export const spreadsheetGetRandomRowSchema = spreadsheetSchema.extend({
  stepType: z.literal(stepTypes.enum.spreadsheetGetRandomRow),
  lookup: spreadsheetColumnFilterSchema,
  map: z.array(spreadsheetMappingSchema).min(1),
})
export type SpreadsheetGetRandomRowSchema = z.infer<
  typeof spreadsheetGetRandomRowSchema
>

export const spreadsheetGetRandomRowDefaultFn =
  (): SpreadsheetGetRandomRowSchema => ({
    ...spreadsheetDefaultFn(),
    stepType: stepTypes.enum.spreadsheetGetRandomRow,
    lookup: spreadsheetColumnFilterDefaultFn(),
    map: [],
  })
