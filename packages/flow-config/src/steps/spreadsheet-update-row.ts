import { z } from "zod"
import {
  spreadsheetColumnFilterDefaultFn,
  spreadsheetColumnFilterSchema,
  spreadsheetDefaultFn,
  spreadsheetMappingSchema,
  spreadsheetSchema,
} from "./spreadsheet"
import { stepTypes } from "./step-action"

export const spreadsheetUpdateRowSchema = spreadsheetSchema.extend({
  stepType: z.literal(stepTypes.enum.spreadsheetUpdateRow),
  lookup: spreadsheetColumnFilterSchema,
  map: z.array(spreadsheetMappingSchema).min(1),
})
export type SpreadsheetUpdateRowSchema = z.infer<
  typeof spreadsheetUpdateRowSchema
>

export const spreadsheetUpdateRowDefaultFn =
  (): SpreadsheetUpdateRowSchema => ({
    ...spreadsheetDefaultFn(),
    stepType: stepTypes.enum.spreadsheetUpdateRow,
    lookup: spreadsheetColumnFilterDefaultFn(),
    map: [],
  })
