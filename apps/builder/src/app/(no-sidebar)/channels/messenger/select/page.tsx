import { messengerIntegrationService } from "@chatbotx.io/business"
import { getUserPages } from "@chatbotx.io/integration-messenger"
import type { ConnectableFacebookPage } from "@chatbotx.io/integration-messenger/schema"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import {
  markAlreadyConnected,
  rankPickerItem,
} from "@/features/channel-connect/lib/picker-items"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import type { MessengerPickerItem } from "@/features/integration-messenger/components/messenger-pages"
import { SelectPage } from "@/features/integration-messenger/components/select-account"
import {
  FB_MESSENGER_PENDING_AUTH_COOKIE,
  readPendingAuth,
} from "@/lib/facebook-pending-auth"

export const dynamic = "force-dynamic"

/**
 * `rankPickerItem`'s rank (0 selectable / 1 not-admin / 2 already-connected)
 * doubles as the disabled-reason lookup, table-driven instead of an
 * if/else-if chain re-deriving the same precedence rank already computes.
 */
const DISABLED_REASON_KEY_BY_RANK: Record<number, string | undefined> = {
  0: undefined,
  1: "messenger.selectPage.notAdminNote",
  2: "messenger.selectPage.alreadyConnectedNote",
}

/**
 * A page is only selectable when the user has full admin permission on it
 * and it isn't already connected elsewhere. Every other page is rendered
 * disabled — its `access_token` is never sent to the client at all: the
 * connect action re-fetches the provider list itself from the pending-auth
 * cookie (plan §4.7/§4.9).
 */
function toPickerItem(
  page: ConnectableFacebookPage & { isAlreadyConnected: boolean },
  t: Awaited<ReturnType<typeof getTranslations>>,
): MessengerPickerItem {
  const rank = rankPickerItem(page)
  const disabledReasonKey = DISABLED_REASON_KEY_BY_RANK[rank]

  return {
    id: page.id,
    name: page.name,
    secondary: page.id,
    disabled: rank !== 0,
    disabledReason: disabledReasonKey ? t(disabledReasonKey) : undefined,
    leading: <InboxIcon channel="messenger" showLabel={false} size="small" />,
    isConnectable: page.isConnectable,
    isAlreadyConnected: page.isAlreadyConnected,
  }
}

export default async function MessengerSelectPage() {
  const pendingAuth = await readPendingAuth(FB_MESSENGER_PENDING_AUTH_COOKIE)

  if (!pendingAuth) {
    redirect("/channels/create")
  }

  const { pages, bmLookupFailed } = await getUserPages(
    pendingAuth.userToken,
    pendingAuth.version,
  )

  const connectedPageIds =
    await messengerIntegrationService.findConnectedPageIds(
      pages.map((page) => page.id),
    )

  const t = await getTranslations()
  const items = markAlreadyConnected(pages, connectedPageIds)
    .sort((current, next) => rankPickerItem(current) - rankPickerItem(next))
    .map((page) => toPickerItem(page, t))

  return (
    <SelectPage
      bmLookupFailed={bmLookupFailed}
      items={items}
      workspaceId={pendingAuth.workspaceId}
    />
  )
}
