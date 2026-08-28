"use client"

import type { MinigameAppearance } from "@chatbotx.io/database/partials"
import { BatteryFullIcon, SignalIcon, WifiIcon } from "lucide-react"
import type { ReactNode } from "react"

type MinigamePreviewLayoutProps = {
  appearance: MinigameAppearance
  name: string
  showName: boolean
  rulesDescription?: string
  art: ReactNode
  startButton: ReactNode
  shareButton?: ReactNode
  prizeDescriptionImageUrl?: string
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

/**
 * Shared admin-preview phone shell for every minigame type — mirrors
 * `MinigamePlayLayout`'s centering: the name floats over the screen instead
 * of taking flow space, so the art stays vertically centered in the phone
 * frame whether or not the name is shown. New types get correct centering
 * for free by supplying `art`/`startButton` instead of re-building this shell.
 */
export function MinigamePreviewLayout({
  appearance,
  name,
  showName,
  rulesDescription,
  art,
  startButton,
  shareButton,
  prizeDescriptionImageUrl,
}: MinigamePreviewLayoutProps) {
  return (
    <div className="w-70 overflow-hidden rounded-[2.5rem] border-8 border-foreground/10 bg-background shadow-xl">
      <div
        className="relative flex aspect-9/19.5 flex-col items-center overflow-y-auto bg-center bg-cover px-4 pb-6"
        style={{
          backgroundColor: appearance.backgroundColor,
          backgroundImage: appearance.backgroundImage.url
            ? `url(${appearance.backgroundImage.url})`
            : undefined,
        }}
      >
        <PhoneStatusBar />

        {showName && (
          <div className="absolute inset-x-0 top-9 px-4 text-center">
            <span
              className="font-semibold text-sm tracking-wide"
              style={{ color: appearance.ruleTextColor }}
            >
              {name}
            </span>
          </div>
        )}

        <div className="flex w-full flex-1 flex-col items-center justify-center gap-3">
          <div className="w-56">{art}</div>
          {startButton}
        </div>

        {shareButton}

        {rulesDescription && (
          <p
            className="whitespace-pre-wrap text-center text-sm"
            style={{ color: appearance.ruleTextColor }}
          >
            {rulesDescription}
          </p>
        )}

        {prizeDescriptionImageUrl && (
          // biome-ignore lint/performance/noImgElement: previewing a workspace-uploaded image, not an optimizable static asset
          <img
            alt=""
            className="w-full max-w-56 object-contain"
            height={400}
            src={prizeDescriptionImageUrl}
            width={750}
          />
        )}
      </div>
    </div>
  )
}
