import { contactEventBus } from "@chatbotx.io/event-bus"
import { contactListeners } from "./listener"

export default {
  bus: contactEventBus,
  listeners: contactListeners,
}
