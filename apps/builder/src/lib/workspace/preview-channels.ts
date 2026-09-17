import type { ChannelType } from "@chatbotx.io/database/partials"
import { cache } from "react"
import { getCurrentUser } from "@/lib/auth/utils"

/**
 * Channels whose provider approval is still pending (today: Threads, awaiting
 * Meta's Threads API review). They are fully implemented, so they stay in
 * `CHANNEL_CAPABILITIES` as normal creatable/manageable channels; this list
 * only keeps their *entry points* out of the product UI until approval lands.
 *
 * Empty this list once every channel in it is approved — nothing else needs
 * to change.
 */
export const PREVIEW_CHANNELS: readonly ChannelType[] = ["threads"]

/**
 * Accounts allowed to see `PREVIEW_CHANNELS` while approval is pending, so the
 * team can connect and demo the channel before it ships to customers.
 * Compared case-insensitively against the session email.
 */
const PREVIEW_CHANNEL_EMAILS: readonly string[] = ["support@ahachat.com"]

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const previewEmails = new Set(PREVIEW_CHANNEL_EMAILS.map(normalizeEmail))

/**
 * Whether the signed-in user is on the preview allowlist. Request-scoped
 * (`cache()`) so the several surfaces that gate on it during one render —
 * the channels settings layout, each channel page, the create picker, the
 * Tools list — share a single session read.
 *
 * Fail-closed: no session, or an email outside the allowlist, hides every
 * preview channel.
 */
export const canSeePreviewChannels = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser()
  return Boolean(user?.email && previewEmails.has(normalizeEmail(user.email)))
})

/**
 * Drops still-unapproved channels from a channel list unless the signed-in
 * user is on the preview allowlist.
 *
 * This is a UI-visibility gate exactly like `tenantService`'s channel policy
 * (AGENTS.md invariant 18): it is never consulted by webhooks, outbound send,
 * or `Inbox`, so a Threads inbox connected during the preview keeps working
 * for everyone in the workspace. Like that policy it only ever narrows what a
 * workspace is offered — call it on a creatable list, never on one already
 * merged with the workspace's connected channels, or hiding the channel would
 * strip an existing connection's settings row and its only disconnect path
 * (invariant 18c).
 */
export async function filterPreviewChannels(
  channels: readonly ChannelType[],
): Promise<ChannelType[]> {
  if (await canSeePreviewChannels()) {
    return [...channels]
  }
  return channels.filter((channel) => !PREVIEW_CHANNELS.includes(channel))
}
