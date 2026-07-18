import { contactService } from "@chatbotx.io/business"
import type { GenderType } from "@chatbotx.io/database/partials"
import type { ContactModel } from "@chatbotx.io/database/types"
import { uploader } from "@chatbotx.io/filesystem"
import type { UpdateMessengerContactDataStepSchema } from "@chatbotx.io/flow-config"
import type { IncomingContact } from "@chatbotx.io/sdk"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow-utils"
import { resolveMessengerUserContext } from "./messenger-context"

// Contact columns this action can write from the Facebook profile. `fullName` is
// a generated column (derived from first/last name) and must never be set.
type UpdatableContactData = Partial<
  Pick<
    ContactModel,
    "firstName" | "lastName" | "avatar" | "locale" | "timezone" | "gender"
  >
>

/**
 * Build the set of fields to write from the fetched profile, keeping only the
 * values Facebook actually returned. `locale`/`timezone`/`gender` require extra
 * page permissions and are frequently absent, so an undefined value must never
 * clobber existing contact data.
 */
function buildCandidate(profile: IncomingContact): UpdatableContactData {
  const candidate: UpdatableContactData = {}
  if (profile.firstName !== undefined) {
    candidate.firstName = profile.firstName
  }
  if (profile.lastName !== undefined) {
    candidate.lastName = profile.lastName
  }
  if (profile.avatar !== undefined) {
    candidate.avatar = profile.avatar
  }
  if (profile.locale !== undefined) {
    candidate.locale = profile.locale
  }
  if (profile.timezone !== undefined) {
    candidate.timezone = profile.timezone
  }
  // `getUserProfile` normalizes gender to the DB enum ("male"/"female"/
  // "unknown") or undefined, so the cast is safe.
  if (profile.gender !== undefined) {
    candidate.gender = profile.gender as GenderType
  }
  return candidate
}

const EXTERNAL_URL_PATTERN = /^https?:\/\//

/**
 * True when `avatar` is an object we uploaded to our own storage (an
 * `.../avatars/<id>` key), so it is safe to delete when superseded. External
 * URLs (http/https) and non-avatar paths are left untouched.
 */
function isManagedAvatarObject(avatar: string): boolean {
  return !EXTERNAL_URL_PATTERN.test(avatar) && avatar.includes("/avatars/")
}

/**
 * Re-sync a Messenger contact's profile (name, avatar, locale, timezone,
 * gender) from Facebook, overwriting the contact's current values. Best-effort
 * and fire-and-forget: a contact with no Messenger inbox, an expired page
 * token, or a Graph error is a silent no-op so the flow always continues.
 */
export async function updateMessengerContactData(
  props: ExecuteStepProps<UpdateMessengerContactDataStepSchema>,
): Promise<void> {
  const { conversation } = props

  const context = await resolveMessengerUserContext(props)
  if (!context) {
    return
  }

  try {
    const profile = (await context.integration.runChannelHandler(
      "contact",
      "getProfile",
      { ctx: context.ctx, data: { sourceId: context.psid } },
    )) as IncomingContact | undefined

    if (!profile) {
      return
    }

    const data = buildCandidate(profile)
    if (Object.keys(data).length === 0) {
      return
    }

    // `getProfile` uploads the fetched picture to a fresh `avatars/<id>` object
    // on every run, so capture the current avatar first and delete it once the
    // new one is persisted — otherwise repeated syncs orphan storage objects.
    const previousAvatar =
      data.avatar === undefined
        ? undefined
        : (
            await contactService.findById({
              workspaceId: conversation.workspaceId,
              id: conversation.contactId,
            })
          )?.avatar

    await contactService.update(
      { workspaceId: conversation.workspaceId, id: conversation.contactId },
      data,
    )

    if (
      previousAvatar &&
      previousAvatar !== data.avatar &&
      isManagedAvatarObject(previousAvatar)
    ) {
      try {
        await uploader.deleteObject(previousAvatar)
      } catch (error) {
        logger.warn(
          { error, path: previousAvatar },
          "updateMessengerContactData: failed to delete superseded avatar",
        )
      }
    }
  } catch (error) {
    logger.error(error, "updateMessengerContactData failed")
  }
}
