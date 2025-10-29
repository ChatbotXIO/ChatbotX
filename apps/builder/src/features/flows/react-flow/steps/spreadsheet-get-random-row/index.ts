import {
  spreadsheetGetRandomRowDefaultFn,
  spreadsheetGetRandomRowSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetGetRandomRowEditor } from "./editor"

export const spreadsheetGetRandomRowStep: StepDefinition = {
  editor: SpreadsheetGetRandomRowEditor,
  viewer: SpreadsheetViewer,
  validator: spreadsheetGetRandomRowSchema,
  defaultFn: spreadsheetGetRandomRowDefaultFn,
}
