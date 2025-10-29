import {
  spreadsheetUpdateRowDefaultFn,
  spreadsheetUpdateRowSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetUpdateRowEditor } from "./editor"

export const spreadsheetUpdateRowStep: StepDefinition = {
  editor: SpreadsheetUpdateRowEditor,
  viewer: SpreadsheetViewer,
  validator: spreadsheetUpdateRowSchema,
  defaultFn: spreadsheetUpdateRowDefaultFn,
}
