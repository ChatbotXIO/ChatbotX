import { getInstagramAccount } from "@chatbotx.io/integration-instagram"
import { redirect } from "next/navigation"
import { SelectAccount } from "@/features/integration-instagram/components/select-accounts"
import {
  FB_INSTAGRAM_PENDING_AUTH_COOKIE,
  readPendingAuth,
} from "@/lib/facebook-pending-auth"

export const dynamic = "force-dynamic"

export default async function InstagramSelectPage() {
  const auth = await readPendingAuth(FB_INSTAGRAM_PENDING_AUTH_COOKIE)

  if (!auth) {
    redirect("/channels/create")
  }

  const account = await getInstagramAccount(auth.userToken)

  if (!account) {
    redirect("/channels/create")
  }

  return <SelectAccount account={account} workspaceId={auth.workspaceId} />
}
