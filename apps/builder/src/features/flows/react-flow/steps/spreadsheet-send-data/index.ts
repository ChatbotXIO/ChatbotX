import {
  type SpreadsheetSendDataSchema,
  spreadsheetSendDataDefaultFn,
  spreadsheetSendDataSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetSendDataEditor } from "./editor"

export const spreadsheetSendDataStep: StepDefinition<SpreadsheetSendDataSchema> =
  {
    editor: SpreadsheetSendDataEditor,
    viewer: SpreadsheetViewer,
    validator: spreadsheetSendDataSchema,
    defaultFn: spreadsheetSendDataDefaultFn,
  }
