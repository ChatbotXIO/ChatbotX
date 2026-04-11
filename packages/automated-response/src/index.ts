import { enqueueMessage } from "./enqueue-message"
import { processPendingMessages } from "./process-messages"
import {
  getAutomatedResponseCachedKey,
  invalidateAutomatedResponsesCache,
} from "./utils"

export const automatedResponseService = {
  enqueue: enqueueMessage,
  process: processPendingMessages,
  getCachedKey: getAutomatedResponseCachedKey,
  invalidateCache: invalidateAutomatedResponsesCache,
}
