import {
  deepseekGenerateTextDefaultFn,
  deepseekGenerateTextSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { DeepseekGenerateTextEditor } from "./editor"
import { DeepseekGenerateTextViewer } from "./viewer"

export const deepseekGenerateTextStep: StepDefinition = {
  editor: DeepseekGenerateTextEditor,
  viewer: DeepseekGenerateTextViewer,
  validator: deepseekGenerateTextSchema,
  defaultFn: deepseekGenerateTextDefaultFn,
}
