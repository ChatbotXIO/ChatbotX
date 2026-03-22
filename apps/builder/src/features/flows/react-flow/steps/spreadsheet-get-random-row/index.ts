import {
  type SpreadsheetGetRandomRowSchema,
  spreadsheetGetRandomRowDefaultFn,
  spreadsheetGetRandomRowSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetGetRandomRowEditor } from "./editor"

export const spreadsheetGetRandomRowStep: StepDefinition<SpreadsheetGetRandomRowSchema> =
  {
    editor: SpreadsheetGetRandomRowEditor,
    viewer: SpreadsheetViewer,
    validator: spreadsheetGetRandomRowSchema,
    defaultFn: spreadsheetGetRandomRowDefaultFn,
  }
