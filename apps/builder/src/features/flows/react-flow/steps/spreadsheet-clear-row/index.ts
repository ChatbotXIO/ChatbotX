import {
  spreadsheetClearRowDefaultFn,
  spreadsheetClearRowSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetClearRowEditor } from "./editor"

export const spreadsheetClearRowStep: StepDefinition = {
  editor: SpreadsheetClearRowEditor,
  viewer: SpreadsheetViewer,
  validator: spreadsheetClearRowSchema,
  defaultFn: spreadsheetClearRowDefaultFn,
}
