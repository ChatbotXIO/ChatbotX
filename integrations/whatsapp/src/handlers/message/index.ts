import { receiveMessage } from "./incomming-message"
import { handleMessageStatus } from "./message-status"
import { sendFlowStep, sendMessage } from "./outgoing-message"

export const messageHandlers = {
  receiveMessage,
  sendMessage,
  sendFlowStep,
  handleMessageStatus,
}
