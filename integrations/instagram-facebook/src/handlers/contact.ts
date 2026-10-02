import { toLogSafeError } from "@chatbotx.io/logger"
import type { ContactHandlers } from "@chatbotx.io/sdk"
import { fetchInstagramContactProfile } from "../apis/contact-profile"
import { getContactProfilePicUrl, getUserProfile } from "../apis/user"
import { logger } from "../lib/logger"
import type { InstagramAuthValue } from "../schema"

const getProfileSnapshot: NonNullable<
  ContactHandlers<InstagramAuthValue>["getProfileSnapshot"]
> = async ({ ctx, data: { sourceId } }) => {
  const profile = await fetchInstagramContactProfile({
    igsid: sourceId,
    accessToken: ctx.auth.tokens.accessToken,
    version: ctx.auth.metadata.version,
  })
  return {
    followsBusiness: profile.followsBusiness,
    businessFollowsContact: profile.businessFollowUser,
    accountVerified: profile.isVerified,
    followerCount: profile.followersCount,
    username: profile.username,
  }
}

export const contactHandlers: Partial<ContactHandlers<InstagramAuthValue>> = {
  getProfile: async ({ ctx, data: { includeProfileSnapshot, sourceId } }) => {
    if (!includeProfileSnapshot) {
      return await getUserProfile({ ctx, psid: sourceId })
    }

    const [profile, snapshot] = await Promise.allSettled([
      getUserProfile({ ctx, psid: sourceId }),
      getProfileSnapshot({ ctx, data: { sourceId } }),
    ])
    if (profile.status === "rejected" && snapshot.status === "rejected") {
      throw profile.reason
    }
    if (profile.status === "rejected") {
      logger.warn(
        { err: toLogSafeError(profile.reason), sourceId },
        "Instagram profile lookup failed",
      )
    }
    if (snapshot.status === "rejected") {
      logger.warn(
        { err: toLogSafeError(snapshot.reason), sourceId },
        "Instagram relationship snapshot lookup failed",
      )
    }

    return {
      ...(profile.status === "fulfilled" ? profile.value : { sourceId }),
      profileSnapshot: snapshot.status === "fulfilled" ? snapshot.value : null,
    }
  },
  getProfileSnapshot,
  getContactProfilePicUrl: async ({ ctx, data: { sourceId } }) =>
    await getContactProfilePicUrl({ ctx, psid: sourceId }),
}
