import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import Image from "next/image"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { CONNECT_PICKER_CARD_CLASS } from "@/features/channel-connect/components/connect-picker-card"
import type { ConnectPickerItem } from "@/features/channel-connect/lib/picker-items"
import { resolveConnectSession } from "@/features/channel-connect/lib/resolve-connect-session"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { SelectFacebookAccounts } from "@/features/integration-instagram/components/select-facebook-accounts"
import { getCurrentUserId } from "@/lib/auth/utils"

export const dynamic = "force-dynamic"

/**
 * `session.targets` is already narrowed to accounts linked to a Page the
 * user administers (Instagram-Facebook's `listCandidates` mirrors
 * `getUserInstagramAccounts`'s `/me/accounts` scoping) — no live re-fetch,
 * and (like Messenger) no "not admin" rank: only selectable vs.
 * already-connected.
 */
function toPickerItem(
  target: {
    id: string
    name: string
    avatarUrl?: string
    selectable: boolean
    alreadyConnected?: "this_workspace" | "other_workspace"
  },
  t: Awaited<ReturnType<typeof getTranslations>>,
): ConnectPickerItem {
  return {
    id: target.id,
    name: target.name,
    secondary: target.id,
    disabled: !target.selectable,
    disabledReason: target.alreadyConnected
      ? t("instagram.selectPage.alreadyConnectedNote")
      : undefined,
    leading: target.avatarUrl ? (
      <Image
        alt={target.name}
        className="size-6 rounded-full object-cover"
        height={24}
        src={target.avatarUrl}
        width={24}
      />
    ) : (
      <InboxIcon channel="instagram" showLabel={false} size="small" />
    ),
  }
}

export default async function InstagramFacebookSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { session: sessionId } = await searchParams
  if (!sessionId) {
    redirect("/channels/create")
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect("/channels/create")
  }

  const resolved = await resolveConnectSession({
    userId,
    sessionId,
    credentialType: "instagramFacebook",
    brandingChannel: "instagram",
  })

  const t = await getTranslations()
  const items = resolved.session.targets
    .map((target) => toPickerItem(target, t))
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
