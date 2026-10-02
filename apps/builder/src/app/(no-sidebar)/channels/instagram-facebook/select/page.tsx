import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { getTranslations } from "next-intl/server"
import { CONNECT_PICKER_CARD_CLASS } from "@/features/channel-connect/components/connect-picker-card"
import {
  resolveSelectSession,
  toConnectPickerItem,
} from "@/features/channel-connect/lib/select-page"
import { SelectFacebookAccounts } from "@/features/integration-instagram/components/select-facebook-accounts"

export const dynamic = "force-dynamic"

/**
 * `session.targets` is already narrowed to accounts linked to a Page the
 * user administers (Instagram-Facebook's `listCandidates` mirrors
 * `getUserInstagramAccounts`'s `/me/accounts` scoping) — no live re-fetch,
 * and (like Messenger) no "not admin" rank: only selectable vs.
 * already-connected.
 */
export default async function InstagramFacebookSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { sessionId, resolved } = await resolveSelectSession({
    searchParams,
    credentialType: "instagramFacebook",
    brandingChannel: "instagram",
  })

  const t = await getTranslations()
  const items = resolved.session.targets
    .map((target) =>
      toConnectPickerItem({
        target,
        channel: "instagram",
        alreadyConnectedLabel: t("instagram.selectPage.alreadyConnectedNote"),
      }),
    )
    .sort((current, next) => Number(current.disabled) - Number(next.disabled))

  return (
    <Card className={CONNECT_PICKER_CARD_CLASS}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("fields.instagram.connectViaFacebook")}</CardTitle>
      </CardHeader>
      <CardContent>
        <SelectFacebookAccounts
          items={items}
          sessionId={sessionId}
          workspaceId={resolved.workspace.id}
        />
      </CardContent>
    </Card>
  )
}
