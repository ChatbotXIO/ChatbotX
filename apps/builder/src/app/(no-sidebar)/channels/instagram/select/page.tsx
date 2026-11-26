import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { CONNECT_PICKER_CARD_CLASS } from "@/features/channel-connect/components/connect-picker-card"
import { AhachatImportAvailability } from "@/features/channel-connect/lib/ahachat-import-availability"
import {
  resolveSelectSession,
  toConnectPickerItem,
} from "@/features/channel-connect/lib/select-page"
import { findConnectPagesOnAhachat } from "@/features/contact-sync/lib/access"
import { SelectAccount } from "@/features/integration-instagram/components/select-accounts"
import { SelectFacebookAccounts } from "@/features/integration-instagram/components/select-facebook-accounts"
import { createChannelPath } from "@/lib/workspace/create-first-workspace"

export const dynamic = "force-dynamic"

/**
 * Direct Instagram Login always yields exactly one target (the logged-in
 * account). Unified Login can yield several (`assigned_instagram_accounts`),
 * which get the multi-account picker. No live re-fetch in either case.
 */
export default async function InstagramSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; connect_error?: string }>
}) {
  const [{ sessionId, resolved }, t] = await Promise.all([
    resolveSelectSession({
      searchParams,
      expectedProvider: "instagram",
      noCandidatesError: "noInstagramAccounts",
    }),
    getTranslations(),
  ])

  const targets = resolved.session.targets
  const ahachatPageIds = await findConnectPagesOnAhachat({
    workspaceId: resolved.workspace.id,
    channel: "instagram",
    pageIds: targets
      .filter((target) => target.selectable)
      .map((target) => target.id),
  })

  if (targets.length > 1) {
    const items = targets
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
          <CardTitle>
            {t("actions.connectFeature", { feature: "Instagram" })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AhachatImportAvailability pageIds={ahachatPageIds}>
            <SelectFacebookAccounts
              items={items}
              provider="instagram"
              sessionId={sessionId}
              workspaceId={resolved.workspace.id}
            />
          </AhachatImportAvailability>
        </CardContent>
      </Card>
    )
  }

  const target = targets[0]
  if (!target) {
    redirect(createChannelPath({ workspaceId: resolved.workspace.id }))
  }

  return (
    <AhachatImportAvailability pageIds={ahachatPageIds}>
      <SelectAccount
        account={{
          id: target.id,
          name: target.name,
          avatarUrl: target.avatarUrl,
        }}
        sessionId={sessionId}
        workspaceId={resolved.workspace.id}
      />
    </AhachatImportAvailability>
  )
}
