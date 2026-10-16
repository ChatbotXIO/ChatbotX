import { LEADERBOARD_PLATFORM_CHANNEL } from "@chatbotx.io/business/leaderboard"
import { leaderboardPlatforms } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { getIdFromParams } from "@chatbotx.io/utils"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { LeaderboardWizard } from "@/features/leaderboards/components/wizard/leaderboard-wizard"
import {
  findLeaderboard,
  getDefaultRulesByPlatform,
  listMinigameOptions,
} from "@/features/leaderboards/queries"

export default async function EditLeaderboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const id = getIdFromParams(resolvedParams, "id")
  if (!(workspaceId && id)) {
    return notFound()
  }
  const [t, leaderboard, minigameOptions] = await Promise.all([
    getTranslations(),
    findLeaderboard({ workspaceId, id }),
    listMinigameOptions(workspaceId),
  ])
  if (!leaderboard) {
    return notFound()
  }
  const listHref = `/space/${workspaceId}/leaderboards`

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("leaderboards.title"), href: listHref },
          { label: leaderboard.name, href: "" },
        ]}
      />
      {leaderboard.availableActions.includes("edit") ? (
        <LeaderboardWizard
          defaultRules={getDefaultRulesByPlatform(leaderboardPlatforms.options)}
          leaderboard={leaderboard}
          minigameOptions={minigameOptions}
          platformChannels={LEADERBOARD_PLATFORM_CHANNEL}
          workspaceId={workspaceId}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-sm">{t("leaderboards.wizard.notEditable")}</p>
            <Button
              nativeButton={false}
              render={<Link href={listHref} />}
              size="sm"
              variant="outline"
            >
              {t("actions.back")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
