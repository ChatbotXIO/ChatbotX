import type { StepDefinition } from ".."
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetClearRowEditor } from "./editor"
import {
  spreadsheetClearRowDefaultFn,
  spreadsheetClearRowSchema,
} from "./schema"

export const spreadsheetClearRowStep: StepDefinition = {
  editor: SpreadsheetClearRowEditor,
  viewer: SpreadsheetViewer,
  validator: spreadsheetClearRowSchema,
  defaultFn: spreadsheetClearRowDefaultFn,
}
