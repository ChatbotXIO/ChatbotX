import { receiveMessage } from "./incoming-message"
import { sendFlowStep, sendMessage } from "./outgoing-message"

export const messageHandlers = {
  receiveMessage,
  sendMessage,
  sendFlowStep,
}
