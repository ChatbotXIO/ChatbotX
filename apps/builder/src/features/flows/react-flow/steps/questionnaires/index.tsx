import {
  type QuestionnairesStepSchema,
  questionnairesStepDefaultFn,
  questionnairesStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import { QuestionnairesActionEditor } from "./editor"
import { QuestionnairesActionViewer } from "./viewer"

export const questionnairesStep: StepDefinition<QuestionnairesStepSchema> = {
  editor: QuestionnairesActionEditor,
  viewer: QuestionnairesActionViewer,
  validator: questionnairesStepSchema,
  defaultFn: questionnairesStepDefaultFn,
}
