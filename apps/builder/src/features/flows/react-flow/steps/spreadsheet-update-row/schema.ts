import { StepType } from "@aha.chat/flow-config"
import { z } from "zod"
import {
  spreadsheetColumnFilterDefaultFn,
  spreadsheetColumnFilterSchema,
  spreadsheetDefaultFn,
  spreadsheetMappingSchema,
  spreadsheetSchema,
} from "../spreadsheet/schema"

export const spreadsheetUpdateRowSchema = spreadsheetSchema.extend({
  stepType: z.literal(StepType.SPREADSHEET_UPDATE_ROW),
  lookup: spreadsheetColumnFilterSchema,
  map: z.array(spreadsheetMappingSchema).min(1),
})
export type SpreadsheetUpdateRowSchema = z.infer<
  typeof spreadsheetUpdateRowSchema
>

export const spreadsheetUpdateRowDefaultFn =
  (): SpreadsheetUpdateRowSchema => ({
    ...spreadsheetDefaultFn(),
    stepType: StepType.SPREADSHEET_UPDATE_ROW,
    lookup: spreadsheetColumnFilterDefaultFn(),
    map: [],
  })
