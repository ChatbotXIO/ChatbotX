import { LEADERBOARD_PLATFORM_CHANNEL } from "@chatbotx.io/business/leaderboard"
import { leaderboardPlatforms } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { LeaderboardWizard } from "@/features/leaderboards/components/wizard/leaderboard-wizard"
import {
  getDefaultRulesByPlatform,
  listMinigameOptions,
} from "@/features/leaderboards/queries"

export default async function CreateLeaderboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const [t, minigameOptions] = await Promise.all([
    getTranslations(),
    listMinigameOptions(workspaceId),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("leaderboards.title"),
            href: `/space/${workspaceId}/leaderboards`,
          },
          { label: t("actions.create"), href: "" },
        ]}
      />
      <LeaderboardWizard
        defaultRules={getDefaultRulesByPlatform(leaderboardPlatforms.options)}
        minigameOptions={minigameOptions}
        platformChannels={LEADERBOARD_PLATFORM_CHANNEL}
        workspaceId={workspaceId}
      />
    </div>
  )
}
