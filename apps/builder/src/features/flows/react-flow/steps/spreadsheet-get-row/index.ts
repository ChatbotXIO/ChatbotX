import {
  type SpreadsheetGetRowSchema,
  spreadsheetGetRowDefaultFn,
  spreadsheetGetRowSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetGetRowEditor } from "./editor"

export const spreadsheetGetRowStep: StepDefinition<SpreadsheetGetRowSchema> = {
  editor: SpreadsheetGetRowEditor,
  viewer: SpreadsheetViewer,
  validator: spreadsheetGetRowSchema,
  defaultFn: spreadsheetGetRowDefaultFn,
}
