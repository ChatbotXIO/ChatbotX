"use client"

import type {
  MinigameAppearance,
  MinigamePrizeSettings,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Gamepad2Icon, Share2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

type GenericMinigamePreviewProps = {
  name: string
  appearance: MinigameAppearance
  prizeSettings: MinigamePrizeSettings
  shareEnabled: boolean
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-70 overflow-hidden rounded-[2.5rem] border-8 border-foreground/10 bg-background shadow-xl">
      <div className="flex aspect-9/19.5 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

function StartButton({
  startButtonImageUrl,
  label,
}: {
  startButtonImageUrl: string
  label: string
}) {
  if (startButtonImageUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: previewing a workspace-uploaded button image, not an optimizable static asset
      <img
        alt={label}
        className="h-10 w-40 object-contain"
        height={40}
        src={startButtonImageUrl}
        width={160}
      />
    )
  }

  return (
    <Button
      className="w-40 rounded-full bg-white text-black shadow-md hover:bg-white/90"
      size="lg"
      type="button"
    >
      {label}
    </Button>
  )
}

export function GenericMinigamePreview({
  name,
  appearance,
  shareEnabled,
}: GenericMinigamePreviewProps) {
  const t = useTranslations()

  return (
    <PhoneFrame>
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-6"
        style={{ backgroundColor: appearance.backgroundColor }}
      >
        <div className="text-center font-semibold text-sm tracking-wide">
          {name}
        </div>

        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/70 px-6 py-8">
          <Gamepad2Icon className="size-10 text-foreground/60" />
          <p className="max-w-40 text-center text-muted-foreground text-xs">
            {t("minigames.preview.comingSoon")}
          </p>
        </div>

        <StartButton
          label={t("minigames.preview.start")}
          startButtonImageUrl={appearance.startButtonImage.url}
        />

        {shareEnabled && (
          <button
            className={cn(
              "flex items-center gap-1.5 text-foreground/80 text-xs underline-offset-2 hover:underline",
            )}
            type="button"
          >
            <Share2Icon className="size-3.5" />
            {t("minigames.preview.shareWithFriends")}
          </button>
        )}
      </div>
    </PhoneFrame>
  )
}
