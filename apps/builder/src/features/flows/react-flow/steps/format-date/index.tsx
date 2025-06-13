import {
  formatDateStepDefaultFn,
  formatDateStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import FormatDateStepEditor from "./editor"
import { FormatDateStepViewer } from "./viewer"

export const formatDateStep: StepDefinition = {
  editor: FormatDateStepEditor,
  viewer: FormatDateStepViewer,
  validator: formatDateStepSchema,
  defaultFn: formatDateStepDefaultFn,
}
