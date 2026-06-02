import { enqueueMessage } from "./enqueue-message"
import { processPendingMessages } from "./process-messages"
import { automatedResponseService as utils } from "./utils"

export const automatedResponseService = {
  ...utils,
  enqueue: enqueueMessage,
  process: processPendingMessages,
}
