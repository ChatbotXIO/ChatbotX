"use client"

import type { ChangeGamificationScoreStepSchema } from "@chatbotx.io/flow-config"
import { TrophyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useLeaderboardOptions } from "@/features/leaderboards/lib/use-leaderboard-options"
import { BaseStepViewer } from "../base/viewer"

const ChangeGamificationScoreStepViewer = ({
  data,
}: {
  data: ChangeGamificationScoreStepSchema
}) => {
  const t = useTranslations()
  const { leaderboards } = useLeaderboardOptions()
  const leaderboard = leaderboards.find(
    (item) => item.id === data.leaderboardId,
  )
  const sign = data.operation === "subtract" ? "-" : "+"

  return (
    <BaseStepViewer
      icon={TrophyIcon}
      title={t("flows.actions.changeGamificationScore")}
    >
      {leaderboard ? (
        <p className="text-muted-foreground text-xs">
          {t("flows.changeGamificationScore.summary", {
            points: `${sign}${data.points}`,
            leaderboard: leaderboard.name,
          })}
        </p>
      ) : undefined}
    </BaseStepViewer>
  )
}

export default ChangeGamificationScoreStepViewer
