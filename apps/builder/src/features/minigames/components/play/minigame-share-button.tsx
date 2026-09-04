"use client"

import { Share2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useClipboard } from "@/hooks/use-clipboard"
import type { MinigameShare } from "../../lib/minigame-share"

type MinigameShareButtonProps = {
  share: MinigameShare
  color: string
}

/**
 * Copies the workspace's share message (with `{{shareUrl}}` already resolved
 * to this player's invite link) rather than the bare URL. `useClipboard`
 * fires the success toast and guards a missing `navigator.clipboard` itself.
 */
export function MinigameShareButton({
  share,
  color,
}: MinigameShareButtonProps) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()

  return (
    <button
      className="flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
      onClick={() => handleCopy(share.message)}
      style={{ color }}
      type="button"
    >
      <Share2Icon className="size-4" />
      {t("minigames.preview.shareWithFriends")}
    </button>
  )
}
