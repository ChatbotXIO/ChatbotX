import { triggerActions } from "@chatbotx.io/database/partials"
import {
  FilterMode,
  spreadsheetColumnFilterSchema,
  spreadsheetContactToSheetMappingSchema,
  spreadsheetSheetToContactMappingSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import z from "zod"

const baseRunGoogleSheetSchema = {
  type: z.literal(triggerActions.enum.runGoogleSheet),
  spreadsheetId: z.string(),
  sheetName: z.string(),
  lookup: spreadsheetColumnFilterSchema,
}

export const runGoogleSheet = z.discriminatedUnion("action", [
  z.object({
    ...baseRunGoogleSheetSchema,
    action: z.literal(stepTypes.enum.spreadsheetGetRow),
    map: z.array(spreadsheetSheetToContactMappingSchema).min(1),
  }),
  z.object({
    ...baseRunGoogleSheetSchema,
    action: z.literal(stepTypes.enum.spreadsheetGetRandomRow),
    map: z.array(spreadsheetSheetToContactMappingSchema).min(1),
  }),
  z.object({
    ...baseRunGoogleSheetSchema,
    action: z.literal(stepTypes.enum.spreadsheetUpdateRow),
    map: z.array(spreadsheetContactToSheetMappingSchema).min(1),
  }),
  z.object({
    ...baseRunGoogleSheetSchema,
    action: z.literal(stepTypes.enum.spreadsheetSendData),
    map: z.array(spreadsheetContactToSheetMappingSchema).min(1),
  }),
  z.object({
    ...baseRunGoogleSheetSchema,
    action: z.literal(stepTypes.enum.spreadsheetClearRow),
  }),
])
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
