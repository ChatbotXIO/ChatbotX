import { receiveMessage } from "./receive-message"
import { sendFlowStep } from "./send-flow-step"
import { sendMessage } from "./send-message"

export const messageHandlers = {
  receiveMessage,
  sendMessage,
  sendFlowStep,
}
