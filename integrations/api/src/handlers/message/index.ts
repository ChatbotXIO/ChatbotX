import { receiveMessage } from "./incoming-message"
import {
  handleMessageStatus,
  sendFlowStep,
  sendMessage,
} from "./outgoing-message"

export const messageHandlers = {
  receiveMessage,
  sendMessage,
  sendFlowStep,
  handleMessageStatus,
}
