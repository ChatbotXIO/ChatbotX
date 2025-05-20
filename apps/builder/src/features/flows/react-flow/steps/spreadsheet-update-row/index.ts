import type { StepDefinition } from ".."
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetUpdateRowEditor } from "./editor"
import {
  spreadsheetUpdateRowDefaultFn,
  spreadsheetUpdateRowSchema,
} from "./schema"

export const spreadsheetUpdateRowStep: StepDefinition = {
  editor: SpreadsheetUpdateRowEditor,
  viewer: SpreadsheetViewer,
  validator: spreadsheetUpdateRowSchema,
  defaultFn: spreadsheetUpdateRowDefaultFn,
}
