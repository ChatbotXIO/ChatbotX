import { TriggerAction } from "@aha.chat/database/enums"
import {
  FilterMode,
  StepType,
  spreadsheetColumnFilterSchema,
  spreadsheetMappingSchema,
} from "@aha.chat/flow-config"
import z from "zod"

export const runGoogleSheet = z.object({
  type: z.literal(TriggerAction.runGoogleSheet),
  action: z.union([
    z.literal(StepType.spreadsheetGetRandomRow),
    z.literal(StepType.spreadsheetClearRow),
    z.literal(StepType.spreadsheetGetRow),
    z.literal(StepType.spreadsheetSendData),
    z.literal(StepType.spreadsheetUpdateRow),
  ]),
  spreadsheetId: z.string(),
  sheetName: z.string(),
  lookup: spreadsheetColumnFilterSchema,
  map: z.array(spreadsheetMappingSchema).min(1),
})
export type RunGoogleSheet = z.infer<typeof runGoogleSheet>

export const defaultFn = (): RunGoogleSheet => ({
  type: TriggerAction.runGoogleSheet,
  action: StepType.spreadsheetGetRow,
  spreadsheetId: "",
  sheetName: "",
  lookup: {
    mode: FilterMode.AND,
    conditions: [],
  },
  map: [],
})
