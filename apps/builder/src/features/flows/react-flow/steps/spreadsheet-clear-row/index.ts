import type { StepDefinition } from ".."
import SpreadsheetClearRowEditor from "./editor"
import {
  spreadsheetClearRowDefaultFn,
  spreadsheetClearRowSchema,
} from "./schema"
import SpreadsheetClearRowViewer from "./viewer"

export const spreadsheetClearRowStep: StepDefinition = {
  editor: SpreadsheetClearRowEditor,
  viewer: SpreadsheetClearRowViewer,
  validator: spreadsheetClearRowSchema,
  defaultFn: spreadsheetClearRowDefaultFn,
}
