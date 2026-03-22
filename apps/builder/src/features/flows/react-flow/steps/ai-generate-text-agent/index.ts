import {
  AIGenerateTextAgentDefaultFn,
  AIGenerateTextAgentSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import AIGenerateTextAgentEditor from "./editor"
import AIGenerateTextAgentViewer from "./viewer"

const AIGenerateTextAgentStep: StepDefinition<AIGenerateTextAgentSchema> = {
  editor: AIGenerateTextAgentEditor,
  viewer: AIGenerateTextAgentViewer,
  validator: AIGenerateTextAgentSchema,
  defaultFn: AIGenerateTextAgentDefaultFn,
}

export default AIGenerateTextAgentStep
