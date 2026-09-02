import { messengerIntegrationService } from "@chatbotx.io/business"
import { getUserPages } from "@chatbotx.io/integration-messenger"
import type { ConnectableFacebookPage } from "@chatbotx.io/integration-messenger/schema"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { PickerFacebookPage } from "@/features/integration-messenger/components/messenger-pages"
import { SelectPage } from "@/features/integration-messenger/components/select-account"
import type { FacebookAuthCallback } from "@/lib/facebook-pending-auth"
import {
  decryptAuth,
  FB_MESSENGER_PENDING_AUTH_COOKIE,
} from "@/lib/facebook-pending-auth"

export const dynamic = "force-dynamic"

/**
 * Picker ordering: selectable pages first, then non-admin pages, then pages
 * already connected elsewhere (matches `getPageOptionNote`'s precedence in
 * messenger-pages.tsx). Nothing is hidden any more — non-admin pages render
 * disabled with a note instead of disappearing — so every page needs a rank.
 * Array.prototype.sort is stable, so Meta's own order survives within a rank.
 */
function rankPickerPage(page: PickerFacebookPage): number {
  if (page.isAlreadyConnected) {
    return 2
  }
  return page.isConnectable ? 0 : 1
}

/**
 * A page is only selectable when the user has full admin permission on it
 * and it isn't already connected elsewhere. Every other page is rendered
 * disabled, so its access_token must never reach the client.
 */
function toPickerPage(
  page: ConnectableFacebookPage,
  connectedPageIds: ReadonlySet<string>,
): PickerFacebookPage {
  const isAlreadyConnected = connectedPageIds.has(page.id)
  const selectable = page.isConnectable && !isAlreadyConnected

  return {
    ...page,
    isAlreadyConnected,
    access_token: selectable ? page.access_token : undefined,
  }
}

export default async function MessengerSelectPage() {
  const token = (await cookies()).get(FB_MESSENGER_PENDING_AUTH_COOKIE)?.value

  const auth = token ? await decryptAuth<FacebookAuthCallback>(token) : null

  if (!auth) {
    redirect("/channels/create")
  }

  const { pages, bmLookupFailed } = await getUserPages(
    auth.userToken,
    auth.version,
  )

  const connectedPageIds = new Set(
    await messengerIntegrationService.findConnectedPageIds(
      pages.map((page) => page.id),
    ),
  )
  const pickerPages: PickerFacebookPage[] = pages
    .map((page) => toPickerPage(page, connectedPageIds))
    .sort((current, next) => rankPickerPage(current) - rankPickerPage(next))

  return (
    <SelectPage
      bmLookupFailed={bmLookupFailed}
      pages={pickerPages}
      referer={auth.referer}
      workspaceId={auth.workspaceId}
    />
  )
}
