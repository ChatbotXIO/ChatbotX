import {
  type WaitUserReplyStepSchema,
  waitUserReplyStepDefaultFn,
  waitUserReplyStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import WaitUserReplyStepEditor from "./editor"
import WaitUserReplyStepViewer from "./viewer"

export const waitUserReplyStep: StepDefinition<WaitUserReplyStepSchema> = {
  editor: WaitUserReplyStepEditor,
  viewer: WaitUserReplyStepViewer,
  validator: waitUserReplyStepSchema,
  defaultFn: waitUserReplyStepDefaultFn,
}
