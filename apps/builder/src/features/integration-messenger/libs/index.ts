import ky from "ky"

export type FacebookPage = {
  id: string
  name: string
  access_token: string
}

export const subscribeScope = [
  "messages",
  "messaging_postbacks",
  "messaging_optins",
  "message_reads",
  "messaging_referrals",
  "message_echoes",
  "messaging_customer_information",
  "messaging_feedback",
  "messaging_policy_enforcement",
  "feed",
  "inbox_labels",
  "live_videos",
  "standby",
].join(",")

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

export async function subscribeApp(
  version: string,
  pageAccessToken: string,
): Promise<void> {
  try {
    await ky
      .post(`https://graph.facebook.com/${version}/me/subscribed_apps`, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          subscribed_fields: subscribeScope,
        }),
        searchParams: {
          access_token: pageAccessToken,
        },
      })
      .json<FacebookPage[]>()
  } catch (_error) {
    // biome-ignore lint/suspicious/noConsole: wip
    console.log(_error)
  }
}

export async function unsubscribeApp(
  version: string,
  pageAccessToken: string,
): Promise<void> {
  try {
    await ky
      .delete(`https://graph.facebook.com/${version}/me/subscribed_apps`, {
        searchParams: {
          access_token: pageAccessToken,
        },
      })
      .json<FacebookPage[]>()
  } catch (_error) {
    // biome-ignore lint/suspicious/noConsole: wip
    console.log(_error)
  }
}
