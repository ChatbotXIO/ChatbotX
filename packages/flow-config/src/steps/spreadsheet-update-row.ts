import { z } from "zod"
import {
  spreadsheetColumnFilterDefaultFn,
  spreadsheetColumnFilterSchema,
  spreadsheetDefaultFn,
  spreadsheetMappingSchema,
  spreadsheetSchema,
} from "./spreadsheet"
import { StepType } from "./step-action"

export const spreadsheetUpdateRowSchema = spreadsheetSchema.extend({
  stepType: z.literal(StepType.spreadsheetUpdateRow),
  lookup: spreadsheetColumnFilterSchema,
  map: z.array(spreadsheetMappingSchema).min(1),
})
export type SpreadsheetUpdateRowSchema = z.infer<
  typeof spreadsheetUpdateRowSchema
>

export const spreadsheetUpdateRowDefaultFn =
  (): SpreadsheetUpdateRowSchema => ({
    ...spreadsheetDefaultFn(),
    stepType: StepType.spreadsheetUpdateRow,
    lookup: spreadsheetColumnFilterDefaultFn(),
    map: [],
  })
