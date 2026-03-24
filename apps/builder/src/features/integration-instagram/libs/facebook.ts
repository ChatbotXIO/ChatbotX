export type InstagramAccount = {
  id: string
  name: string
  username: string
  profile_picture_url?: string
  pageId: string
  pageAccessToken: string
}

type FacebookPage = {
  id: string
  name: string
  access_token: string
  instagram_business_account?: {
    id: string
  }
}

type InstagramUserResponse = {
  id: string
  name: string
  username: string
  profile_picture_url?: string
}

export const getInstagramAccounts = (): Promise<InstagramAccount[]> => {
  return new Promise((resolve, reject) => {
    // @ts-expect-error
    window.FB.api(
      "/me/accounts",
      "get",
      { fields: "id,name,access_token,instagram_business_account" },
      // biome-ignore lint/suspicious/noExplicitAny: Facebook SDK response
      (response: { data: FacebookPage[]; error: any }) => {
        if (response.error) {
          reject(response.error)
          return
        }

        const pagesWithIg = response.data.filter(
          (page) => page.instagram_business_account,
        )

        if (pagesWithIg.length === 0) {
          resolve([])
          return
        }

        const accountPromises = pagesWithIg.map(
          (page) =>
            new Promise<InstagramAccount | null>((resolveAccount) => {
              const igId = page.instagram_business_account?.id
              // @ts-expect-error
              window.FB.api(
                `/${igId}`,
                "get",
                { fields: "id,name,username,profile_picture_url" },
                (igResponse: InstagramUserResponse & { error?: unknown }) => {
                  if (igResponse.error) {
                    resolveAccount(null)
                    return
                  }
                  resolveAccount({
                    id: igResponse.id,
                    name: igResponse.name,
                    username: igResponse.username,
                    profile_picture_url: igResponse.profile_picture_url,
                    pageId: page.id,
                    pageAccessToken: page.access_token,
                  })
                },
              )
            }),
        )

        Promise.all(accountPromises).then((accounts) => {
          resolve(
            accounts.filter(
              (account): account is InstagramAccount => account !== null,
            ),
          )
        })
      },
    )
  })
}
