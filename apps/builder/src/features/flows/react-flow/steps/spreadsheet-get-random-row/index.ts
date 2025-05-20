import type { StepDefinition } from ".."
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetGetRandomRowEditor } from "./editor"
import {
  spreadsheetGetRandomRowDefaultFn,
  spreadsheetGetRandomRowSchema,
} from "./schema"

export const spreadsheetGetRandomRowStep: StepDefinition = {
  editor: SpreadsheetGetRandomRowEditor,
  viewer: SpreadsheetViewer,
  validator: spreadsheetGetRandomRowSchema,
  defaultFn: spreadsheetGetRandomRowDefaultFn,
}
