import type { OrganizationSettings } from "@aha.chat/database/types"
import ky from "ky"

declare const FB: facebook.FacebookStatic // Declare FB if not already globally available

export type FacebookPage = {
  id: string
  name: string
  access_token: string
  category: string
  tasks: number
}

export const getFacebookPages = (): Promise<FacebookPage[]> => {
  return new Promise((resolve, reject) => {
    window.FB.api(
      "/me/accounts",
      "get",
      {},
      // biome-ignore lint/suspicious/noExplicitAny: debug
      (response: { data: FacebookPage[]; error: any }) => {
        if (response.error) {
          reject(response.error)
        } else {
          resolve(response.data)
        }
      },
    )
  })
}

export const exchangeLongLivedToken = async (
  settings: OrganizationSettings,
  accessToken: string,
): Promise<string> => {
  const res: { access_token: string } = await ky
    .get(
      `https://graph.facebook.com/${settings.messengerVersion}/oauth/access_token`,
      {
        searchParams: {
          grant_type: "fb_exchange_token",
          client_id: settings.messengerClientId as string,
          client_secret: settings.messengerClientSecret as string,
          fb_exchange_token: accessToken,
        },
      },
    )
    .json()

  return res.access_token
}
