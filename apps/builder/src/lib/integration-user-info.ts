import type { IntegrationUserInfo } from "@chatbotx.io/database/partials"
import { uploadFileFromUrl } from "@chatbotx.io/filesystem"
import { createId } from "@chatbotx.io/utils"
import { logger } from "@/lib/log"

/**
 * Build the `userInfo` value stored on IntegrationMessenger/IntegrationInstagram
 * from the Graph identity of the authorizing user. Best-effort by design:
 * returns null when the identity is unavailable (expired pending-auth cookie,
 * failed Graph lookup). A failed avatar upload falls back to `existingAvatar`
 * (the value already stored on the row, if any) instead of dropping it — the
 * caller's write replaces the whole `userInfo` column, so losing the fallback
 * here would silently delete a previously-uploaded avatar on every reconnect
 * that hits a transient upload failure.
 */
export async function buildIntegrationUserInfo(props: {
  workspaceId: string
  userId?: string
  userName?: string
  userAccessToken?: string
  avatarUrl?: string
  existingAvatar?: string
}): Promise<IntegrationUserInfo | null> {
  if (!(props.userId && props.userAccessToken)) {
    return null
  }

  let avatar = props.existingAvatar
  if (props.avatarUrl) {
    try {
      const uploaded = await uploadFileFromUrl(
        props.avatarUrl,
        `public/space/${props.workspaceId}/avatars/${createId()}.jpg`,
      )
      avatar = uploaded.originPath
    } catch (error) {
      logger.warn(
        { err: error },
        "Failed to upload integration user avatar to storage",
      )
    }
  }

  return {
    userId: props.userId,
    userName: props.userName ?? "",
    userAccessToken: props.userAccessToken,
    avatar,
  }
}

/**
 * Build the `userInfo` value and, if one could be built, persist it via
 * `persist`. Best-effort: the connection is already live by the time this
 * runs, so any failure (build or persist) is only logged, never thrown.
 */
export async function persistIntegrationUserInfo(props: {
  workspaceId: string
  userId?: string
  userName?: string
  userAccessToken?: string
  avatarUrl?: string
  existingAvatar?: string
  persist: (userInfo: IntegrationUserInfo) => Promise<void>
}): Promise<void> {
  try {
    const userInfo = await buildIntegrationUserInfo(props)
    if (userInfo) {
      await props.persist(userInfo)
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to store integration user info")
  }
}

/**
 * Fetch the authorizing Facebook user via `fetchUser` and build the
 * `userInfo` value from it. Best-effort: a failed lookup returns null instead
 * of throwing, leaving the caller's `userInfo` untouched.
 */
export async function lookupIntegrationUserInfo(props: {
  workspaceId: string
  userAccessToken: string
  existingAvatar?: string
  fetchUser: () => Promise<{ id: string; name: string; avatarUrl?: string }>
}): Promise<IntegrationUserInfo | null> {
  try {
    const fbUser = await props.fetchUser()
    return await buildIntegrationUserInfo({
      workspaceId: props.workspaceId,
      userId: fbUser.id,
      userName: fbUser.name,
      userAccessToken: props.userAccessToken,
      avatarUrl: fbUser.avatarUrl,
      existingAvatar: props.existingAvatar,
    })
  } catch (error) {
    logger.warn(
      { err: error },
      "Failed to fetch Facebook user profile during reconnect",
    )
    return null
  }
}
