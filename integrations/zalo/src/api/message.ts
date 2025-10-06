import ky from "ky"
import { logger } from "../libs/logger"
import type { ZaloAuthValue } from "../schemas/definition"
import type {
  ZaloSendMessageRequest,
  ZaloSendMessageResponse,
} from "../schemas/webhook"

export const sendMessage = async (
  auth: ZaloAuthValue,
  payload: ZaloSendMessageRequest,
): Promise<ZaloSendMessageResponse> => {
  try {
    return await ky
      .post("https://openapi.zalo.me/v3.0/oa/message/cs", {
        headers: {
          access_token: auth.tokens.accessToken,
        },
        json: payload,
      })
      .json()
  } catch (error) {
    logger.error("sendMessage error", error)

    throw new Error(`Zalo Graph API request failed: ${error}`)
  }
}
