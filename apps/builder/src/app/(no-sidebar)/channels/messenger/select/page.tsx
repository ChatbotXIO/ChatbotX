import { findConnectedMessengerPageIds } from "@chatbotx.io/business"
import { getUserPages } from "@chatbotx.io/integration-messenger"
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
 * Picker ordering (mirrors v1): selectable pages first, then pages already
 * connected elsewhere, then pages the user lacks admin permission on.
 */
function rankPickerPage(page: PickerFacebookPage): number {
  if (page.isAlreadyConnected) {
    return 1
  }
  return page.isConnectable ? 0 : 2
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
    await findConnectedMessengerPageIds(pages.map((page) => page.id)),
  )
  const pickerPages: PickerFacebookPage[] = pages
    .map((page) => ({
      ...page,
      isAlreadyConnected: connectedPageIds.has(page.id),
    }))
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
