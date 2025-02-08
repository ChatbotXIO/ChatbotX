import type { IAuth } from "@ahachat.ai/sdk"
import { WhatsAppAPI } from "whatsapp-api-js"

export const getAccessToken = async (auth: IAuth): Promise<string> => {
  return Promise.resolve(auth.accessToken)
}

export const whatsappClient = async (auth: IAuth) => {
  const accessToken = await getAccessToken(auth)

  return new WhatsAppAPI({
    token: accessToken,
    secure: false,
  })
}
