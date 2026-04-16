import { flowEventBus } from "@chatbotx.io/event-bus"
import { flowListeners } from "./listener"

export default {
  bus: flowEventBus,
  listeners: flowListeners,
}
