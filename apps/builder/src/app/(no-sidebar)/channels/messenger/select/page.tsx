import { getUserPages } from "@chatbotx.io/integration-messenger"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SelectPage } from "@/features/integration-messenger/components/select-account"
import type { FacebookAuthCallback } from "@/lib/facebook-pending-auth"
import {
  decryptAuth,
  FB_MESSENGER_PENDING_AUTH_COOKIE,
} from "@/lib/facebook-pending-auth"

export const dynamic = "force-dynamic"

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

  return (
    <SelectPage
      bmLookupFailed={bmLookupFailed}
      pages={pages}
      referer={auth.referer}
      workspaceId={auth.workspaceId}
    />
  )
}
