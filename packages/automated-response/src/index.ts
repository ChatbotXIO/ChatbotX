import { enqueueFlowAction } from "./enqueue-flow-action"
import { enqueueHandoffReentry } from "./enqueue-handoff-reentry"
import { enqueueMessage } from "./enqueue-message"
import { processPendingMessages } from "./process-messages"
import { automatedResponseService as utils } from "./utils"

export const automatedResponseService = {
  ...utils,
  enqueue: enqueueMessage,
  enqueueFlowAction,
  enqueueHandoffReentry,
  process: processPendingMessages,
}

export { replyByOutboundAutomatedResponse } from "./process-outbound-message"
