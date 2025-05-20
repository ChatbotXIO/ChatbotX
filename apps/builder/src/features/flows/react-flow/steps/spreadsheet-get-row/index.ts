import type { StepDefinition } from ".."
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetGetRowEditor } from "./editor"
import { spreadsheetGetRowDefaultFn, spreadsheetGetRowSchema } from "./schema"

export const spreadsheetGetRowStep: StepDefinition = {
  editor: SpreadsheetGetRowEditor,
  viewer: SpreadsheetViewer,
  validator: spreadsheetGetRowSchema,
  defaultFn: spreadsheetGetRowDefaultFn,
}
