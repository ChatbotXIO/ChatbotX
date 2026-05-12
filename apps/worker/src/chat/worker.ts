import { broadcastToWorkspaceParty } from "@chatbotx.io/business"
import type { RealtimeEventData } from "@chatbotx.io/partysocket-config"
import { ChatJobAction, type ChatJobData } from "@chatbotx.io/worker-config"
import { createBullMQWorker } from "../lib/create-worker"
import { logger } from "../lib/logger"
import { sendChatMessage, sendFlowStep } from "./handlers/send-flow-step"
import { sendMessageToChannel } from "./handlers/send-message"
import { sendWhatsappTemplateMessage } from "./handlers/send-whatsapp-template"

await createBullMQWorker<ChatJobData>({
  name: "chat",
  label: "chat",
  handlers: {
    [ChatJobAction.sendChannelMessage]: (data) => sendMessageToChannel(data),
    [ChatJobAction.sendFlowMessage]: (data) => sendFlowStep(data),
    [ChatJobAction.sendChatMessage]: (data) => sendChatMessage(data),
    [ChatJobAction.sendWhatsappTemplateMessage]: (data) =>
      sendWhatsappTemplateMessage(data),
    [ChatJobAction.sendTyping]: () => {
      logger.warn("ChatJobAction.sendTyping is not implemented")
    },
    [ChatJobAction.broadcastEvent]: (data) =>
      broadcastToWorkspaceParty(
        data.workspaceId,
        data.event as RealtimeEventData,
      ),
  },
})
