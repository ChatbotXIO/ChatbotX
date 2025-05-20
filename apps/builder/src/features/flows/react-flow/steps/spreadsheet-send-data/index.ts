import type { StepDefinition } from ".."
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetSendDataEditor } from "./editor"
import {
  spreadsheetSendDataDefaultFn,
  spreadsheetSendDataSchema,
} from "./schema"

export const spreadsheetSendDataStep: StepDefinition = {
  editor: SpreadsheetSendDataEditor,
  viewer: SpreadsheetViewer,
  validator: spreadsheetSendDataSchema,
  defaultFn: spreadsheetSendDataDefaultFn,
}
