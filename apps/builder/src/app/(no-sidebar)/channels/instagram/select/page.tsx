import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { CONNECT_PICKER_CARD_CLASS } from "@/features/channel-connect/components/connect-picker-card"
import {
  resolveSelectSession,
  toConnectPickerItem,
} from "@/features/channel-connect/lib/select-page"
import { SelectAccount } from "@/features/integration-instagram/components/select-accounts"
import { SelectFacebookAccounts } from "@/features/integration-instagram/components/select-facebook-accounts"
import { createChannelPath } from "@/lib/workspace/create-first-workspace"

export const dynamic = "force-dynamic"

/**
 * `session.targets` always has exactly one entry for the direct-login
 * provider (its `exchangeCode` returns the final per-account auth directly,
 * with no `listCandidates` step) — no live `getInstagramAccount` re-fetch.
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

  if (resolved.session.targets.length > 1) {
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
          <CardTitle>
            {t("actions.connectFeature", { feature: "Instagram" })}
          </CardTitle>
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

  const target = resolved.session.targets[0]
  if (!target) {
    redirect(createChannelPath({ workspaceId: resolved.workspace.id }))
  }

  return (
    <SelectAccount
      account={{
        id: target.id,
        name: target.name,
        avatarUrl: target.avatarUrl,
      }}
      sessionId={sessionId}
      workspaceId={resolved.workspace.id}
    />
  )
}
