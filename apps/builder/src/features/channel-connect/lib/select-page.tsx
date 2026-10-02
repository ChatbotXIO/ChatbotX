import type {
  ChannelType,
  CredentialType,
} from "@chatbotx.io/database/partials"
import Image from "next/image"
import { redirect } from "next/navigation"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { getCurrentUserId } from "@/lib/auth/utils"
import { logger } from "@/lib/log"
import type { ConnectPickerItem } from "./picker-items"
import type { ResolvedConnectSession } from "./resolve-connect-session"
import { resolveConnectSession } from "./resolve-connect-session"

/**
 * Shared boilerplate the three `channels/<channel>/select/page.tsx` Server
 * Components each repeated byte-for-byte: pull `session` out of
 * `searchParams` (redirect to the picker if absent), require a signed-in
 * user, then resolve the `ConnectSession` row — an expired/invalid/no-
 * longer-accessible session previously 500'd the render, so any
 * `resolveConnectSession` failure redirects back to `/channels/create`
 * instead. Returns `never` (via `redirect`'s own `never` return type) on
 * every failure path, so a caller's `let resolved: ResolvedConnectSession<T>`
 * assignment type-checks without an extra `else` branch.
 */
export async function resolveSelectSession<T extends CredentialType>(input: {
  searchParams: Promise<{ session?: string }>
  credentialType: T
  brandingChannel: ChannelType
}): Promise<{ sessionId: string; resolved: ResolvedConnectSession<T> }> {
  const { session: sessionId } = await input.searchParams
  if (!sessionId) {
    redirect("/channels/create")
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect("/channels/create")
  }

  try {
    const resolved = await resolveConnectSession({
      userId,
      sessionId,
      credentialType: input.credentialType,
      brandingChannel: input.brandingChannel,
    })
    return { sessionId, resolved }
  } catch (err) {
    logger.warn({ err, sessionId }, "resolveConnectSession failed")
    redirect("/channels/create")
  }
}

/**
 * Shared `ConnectSessionTarget` → `ConnectPickerItem` mapping for the two
 * multi-account select pages (Messenger, Instagram-via-Facebook) — the
 * single-target direct-login Instagram page has no picker row to map.
 * `MessengerPickerItem` is `ConnectPickerItem &
 * {isConnectable, isAlreadyConnected}`, so Messenger's page spreads this
 * result and adds those two fields on top; it has no `avatarUrl` on its own
 * target shape, so `leading` always falls through to the channel
 * `InboxIcon`, unchanged from before this extraction.
 */
export function toConnectPickerItem(input: {
  target: {
    id: string
    name: string
    avatarUrl?: string
    selectable: boolean
    alreadyConnected?: "this_workspace" | "other_workspace"
  }
  channel: ChannelType
  alreadyConnectedLabel: string
}): ConnectPickerItem {
  const { target, channel, alreadyConnectedLabel } = input
  return {
    id: target.id,
    name: target.name,
    secondary: target.id,
    disabled: !target.selectable,
    disabledReason: target.alreadyConnected ? alreadyConnectedLabel : undefined,
    leading: target.avatarUrl ? (
      <Image
        alt={target.name}
        className="size-6 rounded-full object-cover"
        height={24}
        src={target.avatarUrl}
        width={24}
      />
    ) : (
      <InboxIcon channel={channel} showLabel={false} size="small" />
    ),
  }
}
