import ky from "ky"

export type FacebookPage = {
  id: string
  name: string
  access_token: string
}

export async function getListPages(
  version: string,
  accessToken: string,
): Promise<FacebookPage[]> {
  try {
    return await ky
      .get(`https://graph.facebook.com/${version}/me/accounts`, {
        searchParams: {
          access_token: accessToken,
        },
      })
      .json<FacebookPage[]>()
  } catch (_error) {
    return []
  }
}
