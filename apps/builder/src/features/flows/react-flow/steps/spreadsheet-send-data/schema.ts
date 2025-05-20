import { StepType } from "@aha.chat/flow-config"
import { z } from "zod"
import {
  spreadsheetDefaultFn,
  spreadsheetMappingSchema,
  spreadsheetSchema,
} from "../spreadsheet/schema"

export const spreadsheetSendDataSchema = spreadsheetSchema.extend({
  stepType: z.literal(StepType.SPREADSHEET_SEND_DATA),
  map: z.array(spreadsheetMappingSchema).min(1),
})
export type SpreadsheetSendDataSchema = z.infer<
  typeof spreadsheetSendDataSchema
>

export const spreadsheetSendDataDefaultFn = (): SpreadsheetSendDataSchema => ({
  ...spreadsheetDefaultFn(),
  stepType: StepType.SPREADSHEET_SEND_DATA,
  map: [],
})
