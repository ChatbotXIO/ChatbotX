import {
  downloadAttachments,
  parseEcho,
  receiveMessage,
} from "./incoming-message"
import { getMessageMediaUrls } from "./media-urls"
import { sendFlowStep, sendMessage } from "./outgoing-message"

export const messageHandlers = {
  receiveMessage,
  parseEcho,
  downloadAttachments,
  sendMessage,
  sendFlowStep,
  getMessageMediaUrls,
}
