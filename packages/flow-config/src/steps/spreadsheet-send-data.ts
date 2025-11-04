import { z } from "zod"
import {
  spreadsheetDefaultFn,
  spreadsheetMappingSchema,
  spreadsheetSchema,
} from "./spreadsheet"
import { StepType } from "./step-action"

export const spreadsheetSendDataSchema = spreadsheetSchema.extend({
  stepType: z.literal(StepType.spreadsheetSendData),
  map: z.array(spreadsheetMappingSchema).min(1),
})
export type SpreadsheetSendDataSchema = z.infer<
  typeof spreadsheetSendDataSchema
>

export const spreadsheetSendDataDefaultFn = (): SpreadsheetSendDataSchema => ({
  ...spreadsheetDefaultFn(),
  stepType: StepType.spreadsheetSendData,
  map: [],
})
