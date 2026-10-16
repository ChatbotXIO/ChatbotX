import { TrophyIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"

/**
 * Shown (still with a 404 status) when a public leaderboard link points to a
 * leaderboard that was deleted, is unpublished, or never existed — usually an
 * old link kept in a flow. Players are not signed in, so unlike the app-wide
 * 404 there is no "back to home" button.
 */
export default async function LeaderboardNotFound() {
  const t = await getTranslations("leaderboards.public")

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <TrophyIcon className="size-8 text-muted-foreground" />
      </div>
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="font-semibold text-xl tracking-tight">
          {t("unavailableTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("unavailableDescription")}
        </p>
      </div>
    </main>
  )
}
