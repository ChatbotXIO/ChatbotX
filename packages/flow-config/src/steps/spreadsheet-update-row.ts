import { z } from "zod"
import {
  spreadsheetColumnFilterDefaultFn,
  spreadsheetColumnFilterSchema,
  spreadsheetContactToSheetMappingSchema,
  spreadsheetDefaultFn,
  spreadsheetSchema,
  spreadsheetStepVersions,
} from "./spreadsheet"
import { stepTypes } from "./step-action"

export const spreadsheetUpdateRowSchema = spreadsheetSchema.extend({
  stepType: z.literal(stepTypes.enum.spreadsheetUpdateRow),
  version: spreadsheetStepVersions
    .catch(spreadsheetStepVersions.enum.v1)
    .default(spreadsheetStepVersions.enum.v1),
  lookup: spreadsheetColumnFilterSchema,
  map: z.array(spreadsheetContactToSheetMappingSchema).min(1),
})
export type SpreadsheetUpdateRowSchema = z.infer<
  typeof spreadsheetUpdateRowSchema
>

export const spreadsheetUpdateRowDefaultFn =
  (): SpreadsheetUpdateRowSchema => ({
    ...spreadsheetDefaultFn(),
    stepType: stepTypes.enum.spreadsheetUpdateRow,
    version: spreadsheetStepVersions.enum.v2,
    lookup: spreadsheetColumnFilterDefaultFn(),
    map: [],
  })
