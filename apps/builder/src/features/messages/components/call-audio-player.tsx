"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Slider } from "@chatbotx.io/ui/components/ui/slider"
import { PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { formatCallDurationSeconds } from "../lib/format-call-duration"
import { useCallPlaybackStore } from "../store/call-playback-store"

type CallAudioPlayerProps = {
  /** The DB `WhatsappCall.id` — the key the shared playback store plays against. */
  callId: string
  /** Lazily mints (or re-mints, on retry) a signed playback URL. */
  resolveUrl: () => Promise<string>
  /**
   * Known call length (from `WhatsappCall.durationSeconds`) shown as the total
   * before playback starts, so the timer reads `0:00 / 0:20` at rest instead
   * of `0:00 / 0:00` — without eagerly signing/loading the audio just to read
   * its metadata.
   */
  totalDurationSeconds?: number
}

/**
 * Minimal, reusable audio player built on the `@chatbotx.io/ui` `Slider` —
 * a plain progress bar with no waveform rendering. Plays
 * against the single shared `callPlaybackStore` audio element so the
 * progressive call card and the (later) Call Information sheet never run
 * two overlapping streams for the same call.
 */
export const CallAudioPlayer = ({
  callId,
  resolveUrl,
  totalDurationSeconds,
}: CallAudioPlayerProps) => {
  const t = useTranslations("whatsapp.calls.card")
  // Per-field selectors (instead of subscribing to the whole store) so a
  // player only re-renders on ITS OWN call's fields — without this, every
  // mounted card/sheet player re-renders on every `timeupdate` tick (~4Hz)
  // for whichever call happens to be playing.
  const isActive = useCallPlaybackStore((state) => state.callId === callId)
  const status = useCallPlaybackStore((state) =>
    state.callId === callId ? state.status : "idle",
  )
  const currentTime = useCallPlaybackStore((state) =>
    state.callId === callId ? state.currentTime : 0,
  )
  const duration = useCallPlaybackStore((state) =>
    state.callId === callId ? state.duration : 0,
  )
  const volume = useCallPlaybackStore((state) => state.volume)
  const toggle = useCallPlaybackStore((state) => state.toggle)
  const seek = useCallPlaybackStore((state) => state.seek)
  const setVolume = useCallPlaybackStore((state) => state.setVolume)

  const isPlaying = isActive && status === "playing"
  const isLoading = isActive && status === "loading"
  const hasError = isActive && status === "error"
  const displayCurrentTime = isActive ? currentTime : 0
  // Prefer the live audio-element duration once playing; otherwise fall back to
  // the known call length so the total reads correctly at rest.
  const displayDuration =
    isActive && duration > 0 ? duration : (totalDurationSeconds ?? 0)

  return (
    <div className="flex flex-1 items-center gap-2">
      <Button
        aria-label={isPlaying ? t("pause") : t("play")}
        className="size-7 shrink-0 rounded-full"
        disabled={isLoading}
        onClick={() => toggle(callId, resolveUrl)}
        size="icon"
        type="button"
        variant="secondary"
      >
        {isPlaying ? (
          <PauseIcon aria-hidden className="size-3.5" />
        ) : (
          <PlayIcon aria-hidden className="size-3.5" />
        )}
      </Button>
      <span className="w-20 shrink-0 text-muted-foreground text-xs tabular-nums">
        {formatCallDurationSeconds(displayCurrentTime)} /{" "}
        {formatCallDurationSeconds(displayDuration)}
      </span>
      <Slider
        aria-label={t("seek")}
        className="flex-1"
        max={displayDuration || 1}
        min={0}
        onValueChange={(value) => {
          const next = Array.isArray(value) ? value[0] : value
          if (isActive && typeof next === "number") {
            seek(next)
          }
        }}
        step={1}
        value={[displayCurrentTime]}
      />
      <Button
        aria-label={volume === 0 ? t("unmute") : t("mute")}
        className="size-7 shrink-0"
        onClick={() => setVolume(volume === 0 ? 1 : 0)}
        size="icon"
        type="button"
        variant="ghost"
      >
        {volume === 0 ? (
          <VolumeXIcon aria-hidden className="size-3.5" />
        ) : (
          <Volume2Icon aria-hidden className="size-3.5" />
        )}
      </Button>
      {hasError && (
        <span className="text-destructive text-xs">{t("playbackFailed")}</span>
      )}
    </div>
  )
}
