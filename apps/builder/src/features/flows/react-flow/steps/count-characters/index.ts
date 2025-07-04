import {
  countCharactersStepDefaultFn,
  countCharactersStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import CountCharactersStepEditor from "./editor"
import CountCharactersStepViewer from "./viewer"

export const countCharactersStep: StepDefinition = {
  editor: CountCharactersStepEditor,
  viewer: CountCharactersStepViewer,
  validator: countCharactersStepSchema,
  defaultFn: countCharactersStepDefaultFn,
}
