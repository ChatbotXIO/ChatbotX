import { instagramIntegrationService } from "@chatbotx.io/business"
import { getUserInstagramAccounts } from "@chatbotx.io/integration-instagram-facebook"
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
import {
  type ConnectPickerItem,
  markAlreadyConnected,
  rankPickerItem,
} from "@/features/channel-connect/lib/picker-items"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { SelectFacebookAccounts } from "@/features/integration-instagram/components/select-facebook-accounts"
import {
  FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE,
  readPendingAuth,
} from "@/lib/facebook-pending-auth"

export const dynamic = "force-dynamic"

/**
 * `getUserInstagramAccounts` already narrows the provider list to accounts
 * linked to a Page the user administers (`/me/accounts`), so — unlike
 * Messenger's pages — there is no "not an admin" rank; only selectable (0)
 * vs. already-connected (2) ever occurs.
 */
const DISABLED_REASON_KEY_BY_RANK: Record<number, string | undefined> = {
  0: undefined,
  2: "instagram.selectPage.alreadyConnectedNote",
}

/**
 * A row is only selectable when it isn't already connected elsewhere. Its
 * page access token is never sent to the client at all: the connect action
 * re-fetches the provider list itself from the pending-auth cookie (plan
 * §4.7/§4.9). `rank` is computed once per account by the caller (used for
 * both sorting and the disabled-reason lookup) instead of being re-derived
 * here a second time.
 */
function toPickerItem(
  account: {
    id: string
    name: string
    username: string
    profile_picture_url?: string
    isAlreadyConnected: boolean
  },
  rank: number,
  t: Awaited<ReturnType<typeof getTranslations>>,
): ConnectPickerItem {
  const disabledReasonKey = DISABLED_REASON_KEY_BY_RANK[rank]

  return {
    id: account.id,
    name: account.name,
    secondary: `@${account.username}`,
    disabled: rank !== 0,
    disabledReason: disabledReasonKey ? t(disabledReasonKey) : undefined,
    leading: account.profile_picture_url ? (
      <Image
        alt={account.name}
        className="size-6 rounded-full object-cover"
        height={24}
        src={account.profile_picture_url}
        width={24}
      />
    ) : (
      <InboxIcon channel="instagram" showLabel={false} size="small" />
    ),
  }
}

export default async function InstagramFacebookSelectPage() {
  const auth = await readPendingAuth(FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE)

  if (!auth) {
    redirect("/channels/create")
  }

  const accounts = await getUserInstagramAccounts(auth.userToken, auth.version)

  const connectedIgIds = await instagramIntegrationService.findConnectedIgIds(
    accounts.map((account) => account.id),
  )

  const t = await getTranslations()
  const items = markAlreadyConnected(accounts, connectedIgIds)
    .map((account) => ({
      account,
      rank: rankPickerItem({
        isConnectable: true,
        isAlreadyConnected: account.isAlreadyConnected,
      }),
    }))
    .sort((current, next) => current.rank - next.rank)
    .map(({ account, rank }) => toPickerItem(account, rank, t))

  return (
    <Card className={CONNECT_PICKER_CARD_CLASS}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("fields.instagram.connectViaFacebook")}</CardTitle>
      </CardHeader>
      <CardContent>
        <SelectFacebookAccounts items={items} workspaceId={auth.workspaceId} />
      </CardContent>
    </Card>
  )
}
