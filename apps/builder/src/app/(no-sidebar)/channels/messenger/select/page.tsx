import { messengerIntegrationService } from "@chatbotx.io/business"
import {
  getUserPages,
  mapToChannelError,
} from "@chatbotx.io/integration-messenger"
import type { ConnectableFacebookPage } from "@chatbotx.io/integration-messenger/schema"
import { UNKNOWN_ERROR } from "@chatbotx.io/sdk"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import {
  markAlreadyConnected,
  rankPickerItem,
} from "@/features/channel-connect/lib/picker-items"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import type { MessengerPickerItem } from "@/features/integration-messenger/components/messenger-pages"
import {
  type PagesLoadError,
  SelectPage,
} from "@/features/integration-messenger/components/select-account"
import {
  FB_MESSENGER_PENDING_AUTH_COOKIE,
  readPendingAuth,
} from "@/lib/facebook-pending-auth"
import { logger } from "@/lib/log"

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

type UserPagesResult = Awaited<ReturnType<typeof getUserPages>> & {
  loadError?: PagesLoadError
}

/**
 * `mapToChannelError` keeps Graph's numeric `error.code` and falls back to
 * `UNKNOWN_ERROR.code` when there was no Graph error body to read (timeout,
 * DNS, malformed JSON). Any other code means the message is Meta's, not ours.
 */
function readProviderMessage(channelError: {
  code: string | number
  message: string
}): string | undefined {
  const hasGraphCode = channelError.code !== UNKNOWN_ERROR.code
  return hasGraphCode && channelError.message ? channelError.message : undefined
}

/**
 * Graph sometimes refuses `/me/accounts` outright — e.g.
 * `{"error":{"code":1,"message":"Please reduce the amount of data you're
 * asking for, then retry your request"}}` for users with many pages. That is
 * the user's Facebook state, not a bug in this route, so it renders as an
 * empty picker carrying Meta's sentence instead of tripping the route error
 * boundary ("Something went wrong").
 */
async function loadUserPages(
  userToken: string,
  version: string,
): Promise<UserPagesResult> {
  try {
    return await getUserPages(userToken, version)
  } catch (error) {
    const channelError = mapToChannelError(error)
    logger.error(
      {
        err: error,
        code: channelError.code,
        category: channelError.category,
      },
      "Failed to list Facebook Pages for Messenger connect",
    )
    return {
      pages: [],
      bmLookupFailed: false,
      loadError: { providerMessage: readProviderMessage(channelError) },
    }
  }
}

export default async function MessengerSelectPage() {
  const pendingAuth = await readPendingAuth(FB_MESSENGER_PENDING_AUTH_COOKIE)

  if (!pendingAuth) {
    redirect("/channels/create")
  }

  const { pages, bmLookupFailed, loadError } = await loadUserPages(
    pendingAuth.userToken,
    pendingAuth.version,
  )

  if (loadError !== undefined) {
    return (
      <SelectPage
        bmLookupFailed={false}
        items={[]}
        loadError={loadError}
        workspaceId={pendingAuth.workspaceId}
      />
    )
  }

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
