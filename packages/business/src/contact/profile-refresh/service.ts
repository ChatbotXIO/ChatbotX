import type {
  ContactInboxModel,
  ContactModel,
} from "@chatbotx.io/database/types"
import { uploader } from "@chatbotx.io/filesystem"
import type { IncomingContact } from "@chatbotx.io/sdk"
import { logProviderErrorForChannel } from "../../error-log/service"
import { logger } from "../../logger"
import type { ContactAccessScope } from "../service"
import { contactService } from "../service"
import {
  isContactProfileRefreshCoolingDown,
  startContactProfileRefreshCooldown,
} from "./cooldown"
import {
  buildContactProfileUpdate,
  COOLDOWN_BY_PROFILE_SOURCE,
  type ContactProfileNameSource,
  type ContactProfileUpdate,
  hasEmptyProfileName,
  hasProfileName,
} from "./rules"

/**
 * Strategy supplied by the app. It must do ALL channel resolution lazily
 * (integration row, `buildContext`, registry lookup, Graph call) so that any
 * failure along the way surfaces inside `refresh()` as `failed` + cooldown —
 * nothing channel-related happens before the service decides to fetch.
 */
export type ContactProfileFetcher = () => Promise<
  IncomingContact | null | undefined
>

export type ContactProfileRefreshResult =
  | { status: "updated"; contact: ContactModel }
  | { status: "skipped"; reason: "profileComplete" | "coolingDown" }
  | { status: "unavailable" } // fetched (or nullish), but no usable name → nothing written, cooldown started
  | { status: "failed" } // fetch/resolution error or write error → recorded, cooldown started, never thrown

export type RefreshContactProfileInput = {
  workspaceId: string
  contactId: string
  contactInbox: Pick<ContactInboxModel, "id" | "channel">
  source: ContactProfileNameSource // decides cooldown policy via COOLDOWN_BY_PROFILE_SOURCE
  accessScope?: ContactAccessScope // builder passes it; worker omits
  fetchProfile: ContactProfileFetcher // strategy — the app's channel call or the parsed payload
}

const EXTERNAL_URL_PATTERN = /^https?:\/\//

/**
 * True when `avatar` is an object we uploaded to our own storage (an
 * `.../avatars/<id>` key), so it is safe to delete when superseded. External
 * URLs (http/https) and non-avatar paths are left untouched.
 */
const isManagedAvatarObject = (avatar: string): boolean =>
  !EXTERNAL_URL_PATTERN.test(avatar) && avatar.includes("/avatars/")

/**
 * Best-effort deletion of a managed avatar object this attempt just uploaded
 * (via the channel's `getProfile` handler) but is about to discard — either
 * because the profile carried no usable name, or because the subsequent
 * write failed. A delete error is logged and ignored.
 */
const discardUploadedAvatar = async (avatar: string | null | undefined) => {
  if (!(avatar && isManagedAvatarObject(avatar))) {
    return
  }
  try {
    await uploader.deleteObject(avatar)
  } catch (error) {
    logger.warn(
      { error, avatar },
      "discardUploadedAvatar: failed to delete avatar object",
    )
  }
}

const startCooldownIfApplicable = async (
  source: ContactProfileNameSource,
  contactInboxId: string,
): Promise<void> => {
  if (!COOLDOWN_BY_PROFILE_SOURCE[source]) {
    return
  }
  await startContactProfileRefreshCooldown(contactInboxId)
}

/**
 * Wraps `logProviderErrorForChannel` in its own `try/catch` + `logger.warn`
 * so an Error-Log write failure can never surface — every caller here is
 * already inside a `failed` branch.
 */
const recordProfileRefreshFailure = async (input: {
  channel: string
  workspaceId: string
  contactId: string
  error: unknown
}): Promise<void> => {
  try {
    await logProviderErrorForChannel(input.channel, {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      error: input.error,
    })
  } catch (error) {
    logger.warn(
      { error, channel: input.channel, workspaceId: input.workspaceId },
      "recordProfileRefreshFailure: failed to record error log",
    )
  }
}

export type ApplyContactProfileInput = {
  workspaceId: string
  contactId: string
  accessScope?: ContactAccessScope
  update: ContactProfileUpdate
}

/**
 * `contactService.update` (invalidates the contact cache and emits
 * `emitContactInfoChangeEvents`) plus managed-avatar compensation: capture
 * the previous avatar, write the new profile, then delete the superseded
 * managed object. Every `uploader.deleteObject` call is best-effort — logged,
 * never thrown.
 */
export const applyContactProfile = async (
  input: ApplyContactProfileInput,
): Promise<ContactModel> => {
  const { workspaceId, contactId, accessScope, update } = input

  // `getProfile` uploads the fetched picture to a fresh `avatars/<id>` object
  // on every run, so capture the current avatar first and delete it once the
  // new one is persisted — otherwise repeated syncs orphan storage objects.
  const previousAvatar =
    update.avatar === undefined
      ? undefined
      : (
          await contactService.findById({
            workspaceId,
            id: contactId,
            accessScope,
          })
        )?.avatar

  const updated = await contactService.update(
    { workspaceId, id: contactId, accessScope },
    update,
  )

  if (
    previousAvatar &&
    previousAvatar !== update.avatar &&
    isManagedAvatarObject(previousAvatar)
  ) {
    try {
      await uploader.deleteObject(previousAvatar)
    } catch (error) {
      logger.warn(
        { error, path: previousAvatar },
        "applyContactProfile: failed to delete superseded avatar",
      )
    }
  }

  return updated
}

/**
 * Linear pipeline, each step returns early with a typed result. Channel
 * eligibility is decided by the caller from the capability table — this
 * function receives `source` and never inspects the channel name (it only
 * forwards `contactInbox.channel` as opaque data to the error logger).
 */
const refresh = async (
  input: RefreshContactProfileInput,
): Promise<ContactProfileRefreshResult> => {
  const {
    workspaceId,
    contactId,
    contactInbox,
    source,
    accessScope,
    fetchProfile,
  } = input

  const contact = await contactService.findByIdOrFail({
    workspaceId,
    id: contactId,
    accessScope,
  })
  if (!hasEmptyProfileName(contact)) {
    return { status: "skipped", reason: "profileComplete" }
  }

  const cooldownGated = COOLDOWN_BY_PROFILE_SOURCE[source]
  if (
    cooldownGated &&
    (await isContactProfileRefreshCoolingDown(contactInbox.id))
  ) {
    return { status: "skipped", reason: "coolingDown" }
  }

  let profile: IncomingContact | null | undefined
  try {
    profile = await fetchProfile()
  } catch (error) {
    await recordProfileRefreshFailure({
      channel: contactInbox.channel,
      workspaceId,
      contactId,
      error,
    })
    await startCooldownIfApplicable(source, contactInbox.id)
    return { status: "failed" }
  }

  if (profile == null) {
    await startCooldownIfApplicable(source, contactInbox.id)
    return { status: "unavailable" }
  }

  const update = buildContactProfileUpdate(profile)
  if (!hasProfileName(update)) {
    // A nameless write would leave the contact eligible forever and
    // re-upload an avatar on every attempt — discard everything instead.
    await discardUploadedAvatar(update.avatar)
    await startCooldownIfApplicable(source, contactInbox.id)
    return { status: "unavailable" }
  }

  try {
    const updatedContact = await applyContactProfile({
      workspaceId,
      contactId,
      accessScope,
      update,
    })
    return { status: "updated", contact: updatedContact }
  } catch (error) {
    await discardUploadedAvatar(update.avatar)
    await recordProfileRefreshFailure({
      channel: contactInbox.channel,
      workspaceId,
      contactId,
      error,
    })
    await startCooldownIfApplicable(source, contactInbox.id)
    return { status: "failed" }
  }
}

export const contactProfileRefreshService = { refresh }
