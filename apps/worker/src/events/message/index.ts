import { messageEventBus } from "@chatbotx.io/event-bus"
import { messageListeners } from "./listener"

export default {
  bus: messageEventBus,
  listeners: messageListeners,
}
