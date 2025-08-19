import ky from "ky"
import { keys } from "./keys"
import type { RealtimeEventData } from "./schemas"

const env = keys()

export async function broadcastToChatbotParty(
  chatbotId: string,
  json: RealtimeEventData,
) {
  return await ky.post(
    `${env.NEXT_PUBLIC_PARTYSOCKET_URL}/parties/chatbots/${chatbotId}`,
    {
      headers: {
        "X-API-KEY": env.PARTYSOCKET_API_KEY,
      },
      json,
    },
  )
}
