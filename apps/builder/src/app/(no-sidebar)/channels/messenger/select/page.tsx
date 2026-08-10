import { messengerIntegrationService } from "@chatbotx.io/business"
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
 * Picker ordering: selectable pages first, then pages already connected
 * elsewhere. Unconnected pages without connect permission are hidden.
 */
function rankPickerPage(page: PickerFacebookPage): number {
  return page.isAlreadyConnected ? 1 : 0
}

function shouldShowPickerPage(page: PickerFacebookPage): boolean {
  return page.isConnectable || page.isAlreadyConnected
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
    .map((page) => ({
      ...page,
      isAlreadyConnected: connectedPageIds.has(page.id),
    }))
    .filter(shouldShowPickerPage)
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
