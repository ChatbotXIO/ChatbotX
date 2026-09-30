import { toLogSafeError } from "@chatbotx.io/logger"
import type { ContactHandlers } from "@chatbotx.io/sdk"
import { fetchInstagramContactProfile } from "../apis/contact-profile"
import { getContactProfilePicUrl, getUserProfile } from "../apis/user"
import { logger } from "../lib/logger"
import type { InstagramAuthValue } from "../schema"

const getInstagramSnapshot: NonNullable<
  ContactHandlers<InstagramAuthValue>["getInstagramSnapshot"]
> = async ({ ctx, data: { sourceId } }) => {
  const profile = await fetchInstagramContactProfile({
    igsid: sourceId,
    accessToken: ctx.auth.tokens.accessToken,
    version: ctx.auth.metadata.version,
  })
  return {
    follow: profile.followsBusiness,
    followers: profile.followersCount,
    following: profile.businessFollowUser,
    verified: profile.isVerified,
  }
}

export const contactHandlers: Partial<ContactHandlers<InstagramAuthValue>> = {
  getProfile: async ({ ctx, data: { includeInstagramSnapshot, sourceId } }) => {
    if (!includeInstagramSnapshot) {
      return await getUserProfile({ ctx, psid: sourceId })
    }

    const [profile, snapshot] = await Promise.allSettled([
      getUserProfile({ ctx, psid: sourceId }),
      getInstagramSnapshot({ ctx, data: { sourceId } }),
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
      instagramProfile: snapshot.status === "fulfilled" ? snapshot.value : null,
    }
  },
  getInstagramSnapshot,
  getContactProfilePicUrl: async ({ ctx, data: { sourceId } }) =>
    await getContactProfilePicUrl({ ctx, psid: sourceId }),
}
