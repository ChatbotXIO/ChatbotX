import { receiveMessage } from "./incomming-message"
import { sendFlowStep, sendMessage } from "./outgoing-message"

export const messageHandlers = {
  receiveMessage,
  sendMessage,
  sendFlowStep,
}
