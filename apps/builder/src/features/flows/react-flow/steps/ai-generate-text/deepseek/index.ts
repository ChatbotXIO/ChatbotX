import {
  type DeepseekGenerateTextSchema,
  deepseekGenerateTextDefaultFn,
  deepseekGenerateTextSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../../definition"
import { DeepseekGenerateTextEditor } from "./editor"
import { DeepseekGenerateTextViewer } from "./viewer"

export const deepseekGenerateTextStep: StepDefinition<DeepseekGenerateTextSchema> =
  {
    editor: DeepseekGenerateTextEditor,
    viewer: DeepseekGenerateTextViewer,
    validator: deepseekGenerateTextSchema,
    defaultFn: deepseekGenerateTextDefaultFn,
  }
