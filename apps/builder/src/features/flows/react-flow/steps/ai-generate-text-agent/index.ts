import {
  type AIGenerateTextAgentSchema,
  aiGenerateTextAgentDefaultFn,
  aiGenerateTextAgentSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import { AIGenerateTextAgentEditor } from "./editor"
import { AIGenerateTextAgentViewer } from "./viewer"

export const aiGenerateTextAgentStep: StepDefinition<AIGenerateTextAgentSchema> =
  {
    editor: AIGenerateTextAgentEditor,
    viewer: AIGenerateTextAgentViewer,
    validator: aiGenerateTextAgentSchema,
    defaultFn: aiGenerateTextAgentDefaultFn,
  }

export default aiGenerateTextAgentStep
