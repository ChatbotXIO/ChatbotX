import {
  spreadsheetGetRowDefaultFn,
  spreadsheetGetRowSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetGetRowEditor } from "./editor"

export const spreadsheetGetRowStep: StepDefinition = {
  editor: SpreadsheetGetRowEditor,
  viewer: SpreadsheetViewer,
  validator: spreadsheetGetRowSchema,
  defaultFn: spreadsheetGetRowDefaultFn,
}
