import type {
  ContactInboxModel,
  ContactModel,
} from "@chatbotx.io/database/types"
import { uploader } from "@chatbotx.io/filesystem"
import type { IncomingContact } from "@chatbotx.io/sdk"
import { contactInboxService } from "../../contact-inbox/service"
import { finalizeContactProfile } from "../../contact-locale"
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
  contactInbox: Pick<
    ContactInboxModel,
    "id" | "channel" | "contactId" | "language"
  >
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

/**
 * Applies the SAME `locale`/`timezone` normalization the contact-creation
 * path applies (`finalizeContactProfile`), but WITHOUT `phoneHint` or
 * `fallbackLocale` — the contact already exists, so a phone-derived or
 * fallback guess must never overwrite real stored data. Only `channelApi`
 * refreshes call this (invariant: `payload` stays name+avatar only — see
 * `PAYLOAD_NAME_FIELDS` in the worker's fetcher). Each field is normalized
 * independently: `locale`/`timezone` are only replaced in `update` when the
 * channel actually returned that field (existing mapper rule preserved), and
 * `language` is derived the same way creation derives it
 * (`finalizeContactProfile` → `languageFromLocale`) even when the channel
 * returned no locale at all (e.g. an explicit `language` field).
 */
const normalizeChannelApiProfile = (
  profile: IncomingContact,
  update: ContactProfileUpdate,
): { update: ContactProfileUpdate; language: string | undefined } => {
  const finalized = finalizeContactProfile({
    locale: update.locale,
    language: profile.language,
    timezone: update.timezone,
  })

  return {
    update: {
      ...update,
      ...(update.locale !== undefined && { locale: finalized.locale }),
      ...(update.timezone !== undefined && { timezone: finalized.timezone }),
    },
    language: finalized.language ?? undefined,
  }
}

/**
 * Best-effort `ContactInbox.language` write, guarded so an operator- or
 * channel-set language can never be clobbered by a refresh: only writes when
 * the inbox's CURRENT language is empty/null (creation could set it
 * unconditionally only because the row was new). A failure here is logged at
 * `warn` and never changes the refresh result — the `updated` outcome and
 * the write to `Contact` already succeeded.
 */
const writeContactInboxLanguageIfEmpty = async (props: {
  workspaceId: string
  contactInbox: Pick<ContactInboxModel, "id" | "contactId" | "language">
  language: string | undefined
}): Promise<void> => {
  const { workspaceId, contactInbox, language } = props
  if (!(language && !contactInbox.language)) {
    return
  }

  try {
    await contactInboxService.updateLanguage({
      workspaceId,
      contactId: contactInbox.contactId,
      contactInboxId: contactInbox.id,
      language,
    })
  } catch (error) {
    logger.warn(
      { error, contactInboxId: contactInbox.id, workspaceId },
      "writeContactInboxLanguageIfEmpty: failed to update ContactInbox.language",
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
 * already inside a `failed` branch. Exported for the worker's creation-path
 * fetch (`received-message.ts`), which has no `contactId` yet at the point
 * of failure — the contact row does not exist until after `getProfile`
 * would have populated it.
 */
export const recordProfileRefreshFailure = async (input: {
  channel: string
  workspaceId: string
  contactId?: string
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

type ContactWriteContext = {
  workspaceId: string
  id: string
  accessScope?: ContactAccessScope
}

/**
 * Shared core behind `applyContactProfile`/`applyContactProfileIfNameEmpty`:
 * capture the previous avatar, run `write`, then best-effort delete the
 * superseded managed avatar object. `write` is `contactService.update` for
 * an unconditional write, `updateIfProfileNameEmpty` for a conditional one —
 * its own `undefined` return (conditional write matched zero rows) is
 * passed straight through. Every `uploader.deleteObject` call is
 * best-effort — logged, never thrown.
 */
const applyProfile = async (
  input: ApplyContactProfileInput,
  write: (
    ctx: ContactWriteContext,
    update: ContactProfileUpdate,
  ) => Promise<ContactModel | undefined>,
): Promise<ContactModel | undefined> => {
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

  const updated = await write(
    { workspaceId, id: contactId, accessScope },
    update,
  )

  if (!updated) {
    return
  }

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
        "applyProfile: failed to delete superseded avatar",
      )
    }
  }

  return updated
}

/**
 * Unconditional write — `contactService.update` never returns falsy, so
 * this always resolves. Used by the `updateMessengerContactData` flow step,
 * which deliberately overwrites an existing name.
 */
export const applyContactProfile = async (
  input: ApplyContactProfileInput,
): Promise<ContactModel> =>
  (await applyProfile(input, (ctx, update) =>
    contactService.update(ctx, update),
  )) as ContactModel

/**
 * Conditional write via `contactService.updateIfProfileNameEmpty` — a single
 * atomic UPDATE that only lands if the contact's name is STILL empty at
 * write time, closing the TOCTOU race between an earlier eligibility check
 * and this write. Resolves `undefined` when the write matched zero rows
 * (the name was filled concurrently).
 */
export const applyContactProfileIfNameEmpty = async (
  input: ApplyContactProfileInput,
): Promise<ContactModel | undefined> =>
  await applyProfile(input, (ctx, update) =>
    contactService.updateIfProfileNameEmpty(ctx, update),
  )

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

  // Only `channelApi` refreshes get the creation-path locale/timezone
  // normalization and language derivation — `payload` stays name+avatar
  // only (its raw values are exactly what this normalization protects
  // against clobbering).
  const { update: finalizedUpdate, language: finalizedLanguage } =
    source === "channelApi"
      ? normalizeChannelApiProfile(profile, update)
      : { update, language: undefined }

  try {
    // The atomic conditional write folds the "name still empty" check into
    // the write itself instead of a separate read before the write — an
    // operator or a concurrent refresh filling the name while `fetchProfile`
    // was in flight can no longer be clobbered: the write simply matches
    // zero rows, surfaced here as `undefined`.
    const updatedContact = await applyContactProfileIfNameEmpty({
      workspaceId,
      contactId,
      accessScope,
      update: finalizedUpdate,
    })
    if (!updatedContact) {
      // Raced, not failed — no cooldown.
      await discardUploadedAvatar(finalizedUpdate.avatar)
      return { status: "skipped", reason: "profileComplete" }
    }
    await writeContactInboxLanguageIfEmpty({
      workspaceId,
      contactInbox,
      language: finalizedLanguage,
    })
    return { status: "updated", contact: updatedContact }
  } catch (error) {
    await discardUploadedAvatar(finalizedUpdate.avatar)
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
