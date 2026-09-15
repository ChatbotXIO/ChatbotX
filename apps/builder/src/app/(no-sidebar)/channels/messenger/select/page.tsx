import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { resolveConnectSession } from "@/features/channel-connect/lib/resolve-connect-session"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import type { MessengerPickerItem } from "@/features/integration-messenger/components/messenger-pages"
import { SelectPage } from "@/features/integration-messenger/components/select-account"
import { getCurrentUserId } from "@/lib/auth/utils"

export const dynamic = "force-dynamic"

/**
 * `session.targets` is already the fully-computed, admin-filtered,
 * already-connected-marked list `ConnectionService.listAndAttachCandidates`
 * built at authorization time — there is no live `getUserPages` re-fetch
 * here anymore. Two documented, minor scope reductions versus the
 * pending-auth-cookie version of this page:
 * - No "not admin" rank: Messenger's `listCandidates` silently drops pages
 *   the user doesn't administer before they ever become a target, so
 *   `messenger-pages.tsx`'s "you're not an admin on any page" warning banner
 *   can no longer fire — a user who administers zero pages simply sees an
 *   empty picker instead.
 * - `bmLookupFailed` (the Business Manager lookup warning) isn't part of
 *   the session's public target projection, so it's always `false` here.
 */
function toPickerItem(
  target: {
    id: string
    name: string
    selectable: boolean
    alreadyConnected?: "this_workspace" | "other_workspace"
  },
  t: Awaited<ReturnType<typeof getTranslations>>,
): MessengerPickerItem {
  return {
    id: target.id,
    name: target.name,
    secondary: target.id,
    disabled: !target.selectable,
    disabledReason: target.alreadyConnected
      ? t("messenger.selectPage.alreadyConnectedNote")
      : undefined,
    leading: <InboxIcon channel="messenger" showLabel={false} size="small" />,
    isConnectable: true,
    isAlreadyConnected: Boolean(target.alreadyConnected),
  }
}

export default async function MessengerSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { session: sessionId } = await searchParams
  if (!sessionId) {
    redirect("/channels/create")
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect("/channels/create")
  }

  const resolved = await resolveConnectSession({
    userId,
    sessionId,
    credentialType: "messenger",
    brandingChannel: "messenger",
  })

  const t = await getTranslations()
  const items = resolved.session.targets
    .map((target) => toPickerItem(target, t))
    .sort((current, next) => Number(current.disabled) - Number(next.disabled))

  return (
    <SelectPage
      bmLookupFailed={false}
      items={items}
      sessionId={sessionId}
      workspaceId={resolved.workspace.id}
    />
  )
}
