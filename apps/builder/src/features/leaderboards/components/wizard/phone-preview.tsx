"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { CrownIcon, Share2Icon } from "lucide-react"
import { useTranslations } from "next-intl"

const SAMPLE_PODIUM = [
  {
    rank: 2,
    score: 1840,
    pedestal: "h-14 from-slate-200 to-slate-400",
    crown: "text-slate-300",
  },
  {
    rank: 1,
    score: 2350,
    pedestal: "h-20 from-amber-300 to-amber-500",
    crown: "text-amber-400",
  },
  {
    rank: 3,
    score: 1420,
    pedestal: "h-10 from-orange-300 to-orange-500",
    crown: "text-orange-400",
  },
] as const

const SAMPLE_ROWS = [
  { rank: 4, score: 1210 },
  { rank: 5, score: 980 },
  { rank: 6, score: 860 },
] as const

const SAMPLE_VIEWER = { rank: 28, score: 620 }

/**
 * Static phone-frame mock of the public page (banner, podium, ranking,
 * pinned personal bar and share button) — sample numbers only.
 */
export function PhonePreview({
  name,
  coverImageUrl,
  showShare,
}: {
  name: string
  coverImageUrl: string
  showShare: boolean
}) {
  const t = useTranslations()
  const sampleName = (rank: number) =>
    t("leaderboards.preview.sampleName", { rank })

  return (
    <div className="mx-auto w-72 rounded-[2.5rem] border-8 border-foreground/90 bg-background shadow-xl">
      <div className="relative flex h-[34rem] flex-col overflow-hidden rounded-[1.9rem]">
        <div className="flex-1 overflow-hidden">
          <div className="aspect-[1200/630] w-full bg-gradient-to-br from-primary/60 to-primary">
            {coverImageUrl ? (
              // biome-ignore lint/performance/noImgElement: admin-supplied banner URL of any host
              <img
                alt={name}
                className="size-full object-cover"
                height={630}
                src={coverImageUrl}
                width={1200}
              />
            ) : null}
          </div>
          <p className="line-clamp-2 px-3 pt-2 font-bold text-sm">
            {name || t("leaderboards.preview.placeholderName")}
          </p>
          <div className="flex items-end gap-1.5 px-3 pt-3">
            {SAMPLE_PODIUM.map((spot) => (
              <div
                className="flex flex-1 flex-col items-center gap-0.5"
                key={spot.rank}
              >
                <CrownIcon className={cn("size-4", spot.crown)} />
                <div className="size-8 rounded-full bg-muted ring-2 ring-primary/40" />
                <span className="text-[10px]">{sampleName(spot.rank)}</span>
                <span className="text-[10px] text-muted-foreground">
                  {t("leaderboards.public.points", {
                    points: spot.score.toLocaleString(),
                  })}
                </span>
                <div
                  className={cn(
                    "flex w-full justify-center rounded-t-md bg-gradient-to-b pt-1 font-bold text-white text-xs",
                    spot.pedestal,
                  )}
                >
                  {spot.rank}
                </div>
              </div>
            ))}
          </div>
          <ol className="divide-y px-3 pt-1">
            {SAMPLE_ROWS.map((row) => (
              <li className="flex items-center gap-2 py-1.5" key={row.rank}>
                <span className="w-4 text-center text-[10px] text-muted-foreground">
                  {row.rank}
                </span>
                <div className="size-5 rounded-full bg-muted" />
                <span className="flex-1 text-[10px]">
                  {sampleName(row.rank)}
                </span>
                <span className="font-semibold text-[10px]">
                  {t("leaderboards.public.points", {
                    points: row.score.toLocaleString(),
                  })}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex items-center gap-2 border-t bg-background/95 px-3 py-2">
          <div className="size-7 rounded-full bg-primary/20" />
          <span className="flex-1 font-semibold text-xs">
            {t("leaderboards.preview.pinnedBar", {
              rank: SAMPLE_VIEWER.rank,
              points: SAMPLE_VIEWER.score.toLocaleString(),
            })}
          </span>
          {showShare ? (
            <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-1 font-medium text-[10px] text-primary-foreground">
              <Share2Icon className="size-3" />
              {t("leaderboards.public.shareToEarn")}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
