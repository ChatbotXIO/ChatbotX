"use client"

import type { MinigameAppearance } from "@chatbotx.io/database/partials"
import type { ReactNode } from "react"
import { MinigameShareButton } from "./minigame-share-button"

type MinigamePlayLayoutProps = {
  appearance: MinigameAppearance
  name: string
  showName: boolean
  rulesDescription: string
  prizeDescriptionImageUrl: string
  art: ReactNode
  status: ReactNode
  dialog: ReactNode
  shareUrl?: string | null
}

/**
 * Shared play-screen shell for every minigame type — keeps the machine/wheel
 * art vertically centered in the viewport regardless of whether the game
 * name is shown (the name floats as an overlay instead of taking flow space,
 * so toggling it never shifts the art). New types add gameplay by supplying
 * `art`/`status`/`dialog`, not by re-implementing this layout.
 *
 * The share button lives here rather than inside each type's `status` slot so
 * it stays visible in the out-of-draws / not-started / ended states too —
 * out of draws is precisely when a player has a reason to invite someone.
 */
export function MinigamePlayLayout({
  appearance,
  name,
  showName,
  rulesDescription,
  prizeDescriptionImageUrl,
  art,
  status,
  dialog,
  shareUrl,
}: MinigamePlayLayoutProps) {
  return (
    <div
      className="relative flex min-h-screen flex-col items-center bg-center bg-cover px-4 py-8"
      style={{
        backgroundColor: appearance.backgroundColor,
        backgroundImage: appearance.backgroundImage.url
          ? `url(${appearance.backgroundImage.url})`
          : undefined,
      }}
    >
      {showName && (
        <h1
          className="absolute inset-x-0 top-8 px-4 text-center font-semibold text-lg"
          style={{ color: appearance.ruleTextColor }}
        >
          {name}
        </h1>
      )}

      <div className="flex w-full flex-1 flex-col items-center justify-center gap-6">
        <div className="w-full max-w-xs">{art}</div>
        {status}
        {shareUrl && (
          <MinigameShareButton
            color={appearance.ruleTextColor}
            shareUrl={shareUrl}
          />
        )}
      </div>

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
          className="w-full max-w-xs object-contain"
          height={400}
          src={prizeDescriptionImageUrl}
          width={750}
        />
      )}

      {dialog}
    </div>
  )
}
