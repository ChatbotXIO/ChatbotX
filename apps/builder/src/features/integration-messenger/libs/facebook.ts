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
