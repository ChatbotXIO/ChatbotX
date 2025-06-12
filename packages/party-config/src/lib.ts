import ky from "ky"
import type { RealtimeEventData } from "./schemas"

export async function broadcastToChatbotParty(
  chatbotId: string,
  json: RealtimeEventData,
) {
  return await ky.post(
    `${process.env.PARTYSOCKET_URL}/parties/chatbots/${chatbotId}`,
    {
      headers: {
        "X-API-KEY": process.env.PARTYSOCKET_API_KEY,
      },
      json,
    },
  )
}
