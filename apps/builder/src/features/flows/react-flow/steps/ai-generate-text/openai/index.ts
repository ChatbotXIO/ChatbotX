import {
  type OpenAIGenerateTextSchema,
  openAIGenerateTextDefaultFn,
  openAIGenerateTextSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../../definition"
import { OpenAIGenerateTextEditor } from "./editor"
import { OpenAIGenerateTextViewer } from "./viewer"

export const openAIGenerateTextStep: StepDefinition<OpenAIGenerateTextSchema> =
  {
    editor: OpenAIGenerateTextEditor,
    viewer: OpenAIGenerateTextViewer,
    validator: openAIGenerateTextSchema,
    defaultFn: openAIGenerateTextDefaultFn,
  }
