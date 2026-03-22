import type { FacebookPage } from "@aha.chat/integration-messenger/schemas"

// declare const FB: facebook.FacebookStatic // Declare FB if not already globally available

export const getFacebookPages = (): Promise<FacebookPage[]> => {
  return new Promise((resolve, reject) => {
    // @ts-expect-error
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
