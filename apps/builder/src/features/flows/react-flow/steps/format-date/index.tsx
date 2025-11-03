import {
  type FormatDateStepSchema,
  formatDateStepDefaultFn,
  formatDateStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import FormatDateStepEditor from "./editor"
import FormatDateStepViewer from "./viewer"

export const formatDateStep: StepDefinition<FormatDateStepSchema> = {
  editor: FormatDateStepEditor,
  viewer: FormatDateStepViewer,
  validator: formatDateStepSchema,
  defaultFn: formatDateStepDefaultFn,
}
