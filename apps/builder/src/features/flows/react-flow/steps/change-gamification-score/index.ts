import {
  type ChangeGamificationScoreStepSchema,
  changeGamificationScoreStepDefaultFn,
  changeGamificationScoreStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import ChangeGamificationScoreStepEditor from "./editor"
import ChangeGamificationScoreStepViewer from "./viewer"

export const changeGamificationScoreStep: StepDefinition<ChangeGamificationScoreStepSchema> =
  {
    editor: ChangeGamificationScoreStepEditor,
    viewer: ChangeGamificationScoreStepViewer,
    validator: changeGamificationScoreStepSchema,
    defaultFn: changeGamificationScoreStepDefaultFn,
  }
