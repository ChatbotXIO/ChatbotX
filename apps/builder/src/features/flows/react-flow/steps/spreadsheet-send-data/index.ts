import {
  spreadsheetSendDataDefaultFn,
  spreadsheetSendDataSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { SpreadsheetViewer } from "../spreadsheet/viewer"
import { SpreadsheetSendDataEditor } from "./editor"

export const spreadsheetSendDataStep: StepDefinition = {
  editor: SpreadsheetSendDataEditor,
  viewer: SpreadsheetViewer,
  validator: spreadsheetSendDataSchema,
  defaultFn: spreadsheetSendDataDefaultFn,
}
