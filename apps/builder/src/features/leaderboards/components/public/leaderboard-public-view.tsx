"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { CrownIcon, Share2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useAvatarUrl } from "@/features/contacts/utils"
import { useClipboard } from "@/hooks/use-clipboard"
import type {
  PublicLeaderboardBoard,
  PublicLeaderboardViewer,
} from "../../lib/public-board"

const REFRESH_INTERVAL_MS = 10_000

type BoardEntry = PublicLeaderboardBoard["top"][number]

/** JSON dates arrive as strings after a refresh; normalize once. */
const toTime = (value: Date | string) => new Date(value).getTime()

const PODIUM_STYLES = {
  1: {
    crown: "text-amber-400",
    ring: "ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.6)]",
    pedestal: "h-28 bg-gradient-to-b from-amber-300 to-amber-500",
  },
  2: {
    crown: "text-slate-300",
    ring: "ring-slate-300 shadow-[0_0_18px_rgba(203,213,225,0.6)]",
    pedestal: "h-20 bg-gradient-to-b from-slate-200 to-slate-400",
  },
  3: {
    crown: "text-orange-400",
    ring: "ring-orange-400 shadow-[0_0_18px_rgba(251,146,60,0.55)]",
    pedestal: "h-14 bg-gradient-to-b from-orange-300 to-orange-500",
  },
} as const

function Avatar({
  src,
  name,
  className,
}: {
  src: string | null
  name: string
  className?: string
}) {
  // Stored avatars are storage keys (e.g. `public/space/…/avatars/…`), not
  // URLs — rendered raw they resolve against the app host and 404.
  const avatarUrl = useAvatarUrl({ avatar: src })
  return avatarUrl ? (
    // biome-ignore lint/performance/noImgElement: contact avatars come from many external CDNs
    <img
      alt={name}
      className={cn("rounded-full object-cover", className)}
      height={48}
      src={avatarUrl}
      width={48}
    />
  ) : (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground",
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  )
}

function useCountdown(endsAt: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const remaining = Math.max(0, endsAt - now)
  const days = Math.floor(remaining / 86_400_000)
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  return { remaining, days, hours, minutes, seconds }
}

function PodiumSpot({ entry }: { entry: BoardEntry | undefined }) {
  const t = useTranslations("leaderboards.public")
  if (!entry) {
    return <div className="flex-1" />
  }
  const style = PODIUM_STYLES[entry.rank as 1 | 2 | 3]
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <CrownIcon className={cn("size-6", style.crown)} />
      <Avatar
        className={cn("size-14 ring-4", style.ring)}
        name={entry.name}
        src={entry.avatar}
      />
      <p className="line-clamp-1 max-w-24 text-center font-medium text-sm">
        {entry.name}
      </p>
      <p className="text-muted-foreground text-xs">
        {t("points", { points: entry.score.toLocaleString() })}
      </p>
      <div
        className={cn(
          "mt-1 flex w-full items-start justify-center rounded-t-lg pt-2 font-bold text-white",
          style.pedestal,
        )}
      >
        {entry.rank}
      </div>
    </div>
  )
}

function ShareButton({ shareUrl }: { shareUrl: string }) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()

  // Web Share first: it is the only path that works inside the Messenger /
  // Zalo in-app webviews where most players open this page (same reasoning
  // as `MinigameShareButton`).
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ url: shareUrl })
        return
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
      }
    }
    const copied = await handleCopy(shareUrl)
    toast[copied ? "success" : "error"](
      copied ? t("leaderboards.public.linkCopied") : t("messages.copyFailed"),
    )
  }

  return (
    <button
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-2 font-medium text-primary-foreground text-xs"
      onClick={handleShare}
      type="button"
    >
      <Share2Icon className="size-4" />
      {t("leaderboards.public.shareToEarn")}
    </button>
  )
}

export function LeaderboardPublicView({
  initialBoard,
  initialViewer,
  token,
}: {
  initialBoard: PublicLeaderboardBoard
  initialViewer: PublicLeaderboardViewer | null
  token: string | null
}) {
  const t = useTranslations("leaderboards.public")
  const [board, setBoard] = useState(initialBoard)
  const [viewer, setViewer] = useState(initialViewer)
  const etagRef = useRef<string | null>(null)
  const countdown = useCountdown(toTime(board.endsAt))
  const isFinished = board.status === "finished" || countdown.remaining === 0

  // Polls the shared board (ETag → 304 when unchanged) and, for a signed
  // viewer, their own rank. Stops once the campaign is over.
  useEffect(() => {
    if (board.status === "finished") {
      return
    }
    const refresh = async () => {
      if (document.visibilityState !== "visible") {
        return
      }
      try {
        const response = await fetch(`/api/leaderboards/${board.id}/board`, {
          headers: etagRef.current ? { "If-None-Match": etagRef.current } : {},
        })
        if (response.status === 200) {
          etagRef.current = response.headers.get("ETag")
          setBoard(await response.json())
        }
        if (token) {
          const me = await fetch(
            `/api/leaderboards/${board.id}/me?token=${encodeURIComponent(token)}`,
          )
          if (me.ok) {
            const payload = (await me.json()) as {
              viewer: PublicLeaderboardViewer | null
            }
            setViewer(payload.viewer)
          }
        }
      } catch {
        // Offline / transient: keep showing the last good data.
      }
    }
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [board.id, board.status, token])

  const podium = [1, 2, 3].map((rank) =>
    board.top.find((entry) => entry.rank === rank),
  )
  const rest = board.top.filter((entry) => entry.rank > 3)

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background pb-28">
      {board.coverImageUrl ? (
        // biome-ignore lint/performance/noImgElement: admin-supplied banner URL of any host
        <img
          alt={board.name}
          className="aspect-[1200/630] w-full object-cover"
          height={630}
          src={board.coverImageUrl}
          width={1200}
        />
      ) : null}

      <header className="flex flex-col gap-2 px-4 pt-4">
        <h1 className="font-bold text-2xl leading-tight">{board.name}</h1>
        <div className="flex items-center gap-2 text-sm">
          {isFinished ? (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
              {t("finished")}
            </span>
          ) : (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
              {t("endsIn", {
                days: countdown.days,
                hours: countdown.hours,
                minutes: countdown.minutes,
                seconds: countdown.seconds,
              })}
            </span>
          )}
        </div>
        {board.description ? (
          <p className="whitespace-pre-line text-muted-foreground text-sm">
            {board.description}
          </p>
        ) : null}
      </header>

      {board.top.length === 0 ? (
        <p className="px-4 py-16 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <>
          <section className="flex items-end gap-2 px-4 pt-8">
            <PodiumSpot entry={podium[1]} />
            <PodiumSpot entry={podium[0]} />
            <PodiumSpot entry={podium[2]} />
          </section>

          <ol className="flex flex-col divide-y px-4 pt-4">
            {rest.map((entry) => (
              <li className="flex items-center gap-3 py-3" key={entry.rank}>
                <span className="w-8 text-center font-semibold text-muted-foreground">
                  {entry.rank}
                </span>
                <Avatar
                  className="size-9"
                  name={entry.name}
                  src={entry.avatar}
                />
                <span className="flex-1 truncate text-sm">{entry.name}</span>
                <span className="font-semibold text-sm">
                  {t("points", { points: entry.score.toLocaleString() })}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      {viewer ? (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t bg-background/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <Avatar
              className="size-10"
              name={viewer.name ?? "?"}
              src={viewer.avatar}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold text-sm">
                {viewer.rank
                  ? t("myRank", { rank: viewer.rank })
                  : t("unranked")}
              </span>
              <span className="text-muted-foreground text-xs">
                {t("points", { points: viewer.score.toLocaleString() })}
              </span>
            </div>
            {viewer.shareUrl && !isFinished ? (
              <ShareButton shareUrl={viewer.shareUrl} />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
