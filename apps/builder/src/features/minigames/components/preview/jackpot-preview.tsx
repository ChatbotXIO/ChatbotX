"use client"

import type {
  MinigameAppearance,
  MinigamePrizeSettings,
} from "@chatbotx.io/database/partials"
import { JackpotMachineArt, JackpotStartButton } from "@chatbotx.io/minigame-ui"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  BatteryFullIcon,
  CircleHelpIcon,
  Share2Icon,
  SignalIcon,
  WifiIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

type JackpotPreviewProps = {
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

function PhoneStatusBar() {
  return (
    <div className="flex w-full items-center justify-between px-4 pt-2 text-xs">
      <span className="font-medium">8:15</span>
      <div className="flex items-center gap-1">
        <SignalIcon className="size-3.5" />
        <WifiIcon className="size-3.5" />
        <BatteryFullIcon className="size-3.5" />
      </div>
    </div>
  )
}

function RulesButton({ ruleTextColor }: { ruleTextColor: string }) {
  const t = useTranslations()

  return (
    <button
      aria-label={t("minigames.preview.rules")}
      className="absolute top-0 right-0 flex size-6 items-center justify-center rounded-full bg-background/70 shadow-sm backdrop-blur-sm"
      style={{ color: ruleTextColor }}
      type="button"
    >
      <CircleHelpIcon className="size-3.5" />
    </button>
  )
}

export function JackpotPreview({
  name,
  appearance,
  shareEnabled,
}: JackpotPreviewProps) {
  const t = useTranslations()

  return (
    <PhoneFrame>
      <div
        className="flex flex-1 flex-col items-center gap-3 bg-center bg-cover px-4 pb-6"
        style={{
          backgroundColor: appearance.backgroundColor,
          backgroundImage: appearance.backgroundImage.url
            ? `url(${appearance.backgroundImage.url})`
            : undefined,
        }}
      >
        <PhoneStatusBar />

        <div className="relative w-full pt-1 text-center">
          <span
            className="font-semibold text-sm tracking-wide"
            style={{ color: appearance.ruleTextColor }}
          >
            {name || t("minigames.preview.jackpotHeader")}
          </span>
          <RulesButton ruleTextColor={appearance.ruleTextColor} />
        </div>

        <div className="w-56">
          <JackpotMachineArt
            decorativeColor={appearance.decorativeColor}
            machineColor={appearance.machineColor}
          />
        </div>

        <JackpotStartButton
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

        {appearance.prizeDescriptionImage.url && (
          // biome-ignore lint/performance/noImgElement: previewing a workspace-uploaded image, not an optimizable static asset
          <img
            alt=""
            className="w-full max-w-56 object-contain"
            height={400}
            src={appearance.prizeDescriptionImage.url}
            width={750}
          />
        )}
      </div>
    </PhoneFrame>
  )
}
