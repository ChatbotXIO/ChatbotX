import { triggerActions } from "@chatbotx.io/database/partials"
import {
  FilterMode,
  spreadsheetColumnFilterSchema,
  spreadsheetMappingSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import z from "zod"

export const runGoogleSheet = z.object({
  type: z.literal(triggerActions.enum.runGoogleSheet),
  action: z.union([
    z.literal(stepTypes.enum.spreadsheetGetRandomRow),
    z.literal(stepTypes.enum.spreadsheetClearRow),
    z.literal(stepTypes.enum.spreadsheetGetRow),
    z.literal(stepTypes.enum.spreadsheetSendData),
    z.literal(stepTypes.enum.spreadsheetUpdateRow),
  ]),
  spreadsheetId: z.string(),
  sheetName: z.string(),
  lookup: spreadsheetColumnFilterSchema,
  map: z.array(spreadsheetMappingSchema).min(1),
})
export type RunGoogleSheet = z.infer<typeof runGoogleSheet>

export const defaultFn = (): RunGoogleSheet => ({
  type: triggerActions.enum.runGoogleSheet,
  action: stepTypes.enum.spreadsheetGetRow,
  spreadsheetId: "",
  sheetName: "",
  lookup: {
    mode: FilterMode.AND,
    conditions: [],
  },
  map: [],
})
