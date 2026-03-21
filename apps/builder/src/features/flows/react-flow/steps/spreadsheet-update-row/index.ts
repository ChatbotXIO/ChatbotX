import {
  type SpreadsheetUpdateRowSchema,
  spreadsheetUpdateRowDefaultFn,
  spreadsheetUpdateRowSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetUpdateRowEditor } from "./editor"

export const spreadsheetUpdateRowStep: StepDefinition<SpreadsheetUpdateRowSchema> =
  {
    editor: SpreadsheetUpdateRowEditor,
    viewer: SpreadsheetViewer,
    validator: spreadsheetUpdateRowSchema,
    defaultFn: spreadsheetUpdateRowDefaultFn,
  }
