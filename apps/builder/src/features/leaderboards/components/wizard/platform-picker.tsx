"use client"

import type { LeaderboardPlatform } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CheckIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  LEADERBOARD_PLATFORM_ICON,
  LEADERBOARD_PLATFORM_LABEL_KEY,
  LEADERBOARD_PLATFORMS,
} from "../../lib/platforms"

/** The 7 platform tiles; exactly one is selected. */
export function PlatformPicker({
  value,
  onChange,
  disabled,
}: {
  value: LeaderboardPlatform
  onChange: (platform: LeaderboardPlatform) => void
  disabled?: boolean
}) {
  const t = useTranslations()
  return (
    <div className="flex flex-col gap-2">
      <Label>{t("leaderboards.wizard.platform")}</Label>
      <div
        aria-label={t("leaderboards.wizard.platform")}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
        role="radiogroup"
      >
        {LEADERBOARD_PLATFORMS.map((platform) => {
          const Icon = LEADERBOARD_PLATFORM_ICON[platform]
          const selected = platform === value
          return (
            <Button
              aria-checked={selected}
              className={cn(
                "relative h-auto flex-col gap-2 py-3",
                selected && "border-primary bg-primary/5",
              )}
              data-platform={platform}
              disabled={disabled && !selected}
              key={platform}
              onClick={() => onChange(platform)}
              role="radio"
              type="button"
              variant="outline"
            >
              {selected ? (
                <CheckIcon className="absolute end-1.5 top-1.5 size-3.5 text-primary" />
              ) : null}
              <Icon className="size-5" />
              <span className="text-xs">
                {t(LEADERBOARD_PLATFORM_LABEL_KEY[platform])}
              </span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
