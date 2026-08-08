import { replyByOutboundAutomatedResponse } from "@chatbotx.io/automated-response"
import type { ChatJobCheckOutboundAutomatedResponse } from "@chatbotx.io/worker-config"

export const checkOutboundAutomatedResponse = async (
  data: ChatJobCheckOutboundAutomatedResponse["data"],
): Promise<void> => {
  await replyByOutboundAutomatedResponse(data)
}
