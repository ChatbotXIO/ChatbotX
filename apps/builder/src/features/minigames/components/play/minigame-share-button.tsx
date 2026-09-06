"use client"

import { Share2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useClipboard } from "@/hooks/use-clipboard"

type MinigameShareButtonProps = {
  shareUrl: string
  color: string
}

/**
 * Shares a ref link for the channel this player is playing on — a friend who
 * opens it runs the minigame's Sharing Node and earns this player a bonus
 * draw.
 *
 * Tries the Web Share API first: it matches the label, and it is the only
 * path that works in the in-app webviews (Messenger, Zalo) where most of
 * these players actually are. `navigator.clipboard` is unavailable there and
 * on plain HTTP, and `useClipboard` only `console.warn`s in that case — so
 * its boolean result is checked here and surfaced as a toast rather than
 * leaving the button looking dead.
 */
export function MinigameShareButton({
  shareUrl,
  color,
}: MinigameShareButtonProps) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ url: shareUrl })
        return
      } catch (error) {
        // The user dismissing the share sheet rejects with `AbortError`;
        // that is a completed interaction, not a failure to report.
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
      }
    }

    const copied = await handleCopy(shareUrl)
    if (!copied) {
      toast.error(t("messages.copyFailed"))
    }
  }

  return (
    <button
      className="flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
      onClick={handleShare}
      style={{ color }}
      type="button"
    >
      <Share2Icon className="size-4" />
      {t("minigames.preview.shareWithFriends")}
    </button>
  )
}
