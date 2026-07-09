import { getUserInstagramAccounts } from "@chatbotx.io/integration-instagram-facebook"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { SelectFacebookAccounts } from "@/features/integration-instagram/components/select-facebook-accounts"
import type { FacebookAuthCallback } from "@/lib/facebook-pending-auth"
import {
  decryptAuth,
  FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE,
} from "@/lib/facebook-pending-auth"

export const dynamic = "force-dynamic"

export default async function InstagramFacebookSelectPage() {
  const token = (await cookies()).get(
    FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE,
  )?.value

  const auth = token ? await decryptAuth<FacebookAuthCallback>(token) : null

  if (!auth) {
    redirect("/channels/create")
  }

  const accounts = await getUserInstagramAccounts(auth.userToken, auth.version)

  if (accounts.length === 0) {
    redirect("/channels/create?error=no_instagram_accounts")
  }

  const t = await getTranslations()

  return (
    <Card className="mx-auto mt-40 max-w-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("fields.instagram.connectViaFacebook")}</CardTitle>
      </CardHeader>
      <CardContent>
        <SelectFacebookAccounts
          accounts={accounts}
          version={auth.version}
          workspaceId={auth.workspaceId}
        />
      </CardContent>
    </Card>
  )
}
