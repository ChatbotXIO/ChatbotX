import { ChatbotXException } from "@chatbotx.io/business/errors"
import type {
  ChannelType,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import Image from "next/image"
import { redirect } from "next/navigation"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { getCurrentUserId } from "@/lib/auth/utils"
import { logger } from "@/lib/log"
import {
  type CreateChannelErrorCode,
  isCreateChannelErrorCode,
} from "@/lib/workspace/create-first-workspace"
import type { ConnectPickerItem } from "./picker-items"
import type { ResolvedConnectSessionBinding } from "./resolve-connect-session"
import { resolveConnectSessionForSelect } from "./resolve-connect-session"

/** Every other session-level failure (expired, not-member, a session that already failed/cancelled/completed) reads as the generic "start again" code — only the plan-limit codes get their own copy. */
const FALLBACK_ERROR_CODE: CreateChannelErrorCode = "sessionExpired"

/**
 * Shared boilerplate the three `channels/<channel>/select/page.tsx` Server
 * Components each repeated byte-for-byte: pull `session` out of
 * `searchParams` (redirect to the picker if absent), require a signed-in
 * user, then resolve the `ConnectSession` row — any known session-level
 * failure (expired/not-member/a session already in a terminal status, or a
 * known plan-limit denial) redirects to `/channels/create?error=<code>`
 * instead of 500ing. A genuinely unexpected error (a DB blip, a bug) is
 * logged at `error` and rethrown — it must not be swallowed into a silent
 * redirect. Returns `never` (via `redirect`'s own `never` return type) on
 * every failure path, so a caller's `let resolved: ResolvedConnectSessionBinding`
 * assignment type-checks without an extra `else` branch.
 */
export async function resolveSelectSession(input: {
  searchParams: Promise<{ session?: string }>
  expectedProvider: IntegrationType
}): Promise<{ sessionId: string; resolved: ResolvedConnectSessionBinding }> {
  const { session: sessionId } = await input.searchParams
  if (!sessionId) {
    redirect("/channels/create")
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect("/channels/create")
  }

  try {
    const resolved = await resolveConnectSessionForSelect({
      userId,
      sessionId,
      expectedProvider: input.expectedProvider,
    })
    return { sessionId, resolved }
  } catch (err) {
    if (err instanceof ChatbotXException) {
      const code = isCreateChannelErrorCode(err.code)
        ? err.code
        : FALLBACK_ERROR_CODE
      logger.warn(
        { err, sessionId, code },
        "resolveConnectSession rejected the select page",
      )
      redirect(`/channels/create?error=${code}`)
    }
    logger.error(
      { err, sessionId },
      "resolveConnectSession failed unexpectedly",
    )
    throw err
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
