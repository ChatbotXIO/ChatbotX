import {
  type GenerateCodeStepSchema,
  generateCodeStepDefaultFn,
  generateCodeStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import GenerateCodeStepEditor from "./editor"
import GenerateCodeStepViewer from "./viewer"

export const generateCodeStep: StepDefinition<GenerateCodeStepSchema> = {
  editor: GenerateCodeStepEditor,
  viewer: GenerateCodeStepViewer,
  validator: generateCodeStepSchema,
  defaultFn: generateCodeStepDefaultFn,
}
