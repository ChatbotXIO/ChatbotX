import { getTranslations } from "next-intl/server"
import {
  resolveSelectSession,
  toConnectPickerItem,
} from "@/features/channel-connect/lib/select-page"
import type { MessengerPickerItem } from "@/features/integration-messenger/components/messenger-pages"
import { SelectPage } from "@/features/integration-messenger/components/select-account"

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
export default async function MessengerSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { sessionId, resolved } = await resolveSelectSession({
    searchParams,
    credentialType: "messenger",
    brandingChannel: "messenger",
  })

  const t = await getTranslations()
  const items: MessengerPickerItem[] = resolved.session.targets
    .map((target) => ({
      ...toConnectPickerItem({
        target,
        channel: "messenger",
        alreadyConnectedLabel: t("messenger.selectPage.alreadyConnectedNote"),
      }),
      isConnectable: true,
      isAlreadyConnected: Boolean(target.alreadyConnected),
    }))
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
