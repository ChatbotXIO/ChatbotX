"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useTenantSettings } from "@/features/tenant"

/** Channels with an icon under `public/chat-widget/icons/` (others use `chat`). */
const WIDGET_ICON_CHANNELS: ChannelType[] = [
  "messenger",
  "whatsapp",
  "instagram",
  "telegram",
  "zalo",
  "webchat",
]

export const getWidgetIconUrl = (channel: ChannelType | "chat") =>
  `/chat-widget/icons/${
    channel !== "chat" && WIDGET_ICON_CHANNELS.includes(channel)
      ? channel
      : "chat"
  }.svg`

const BUTTON_CLASS_NAME =
  "block size-14 overflow-hidden rounded-full bg-white shadow-[0_6px_16px_rgba(0,0,0,0.18)] transition-transform hover:scale-105"

// Same motion as the embed script (modelled on Callbell's widget): the list
// fades as a whole while each channel slides 30px on a spring, 120ms apart,
// top-down on open and bottom-up on close. Keep in sync with
// `public/chat-widget/ref-widget.js`.
const STAGGER_MS = 120
const OPEN_LEAD_MS = 20
const POWERED_BY_DELAY_MS = 350
const FADE = "300ms cubic-bezier(0, 0, 0.2, 1)"
// A stiffness 500 / damping 25 spring, sampled into linear().
const SPRING =
  "450ms linear(0, 0.049, 0.172, 0.333, 0.505, 0.67, 0.814, 0.93, 1.016, 1.074, 1.107, 1.12, 1.117, 1.105, 1.086, 1.066, 1.045, 1.027, 1.012, 1.001, 0.993, 0.988, 0.986, 0.986, 0.987, 0.989, 0.991, 0.994, 0.996, 0.998, 1)"

const slideTransition = (delayMs: number) =>
  `transform ${SPRING} ${delayMs}ms, opacity ${FADE} ${delayMs}ms`

type ReflinkChatWidgetPreviewProps = {
  channels: { id: string; channel: ChannelType; name: string }[]
}

/**
 * Dashboard look-alike of `public/chat-widget/ref-widget.js` — keep the two
 * in sync. Starts expanded so the preview shows the enabled channels.
 */
export function ReflinkChatWidgetPreview({
  channels,
}: ReflinkChatWidgetPreviewProps) {
  const t = useTranslations()
  const { name, faviconUrl } = useTenantSettings()
  const [expanded, setExpanded] = useState(true)
  const fallbackLogoUrl = getWidgetIconUrl("chat")

  return (
    // Same corner spacing as the embed script: 16px from the left, the
    // powered-by line 6px from the bottom.
    <div className="flex min-h-80 items-end rounded-lg border bg-muted/40 px-4 pt-4 pb-1.5">
      <div className="flex flex-col items-center">
        <div
          aria-hidden={!expanded}
          className={cn(
            "mb-3.5 flex flex-col gap-3.5 motion-reduce:transition-none!",
            !expanded && "pointer-events-none",
          )}
          inert={!expanded}
          style={{
            opacity: expanded ? 1 : 0,
            visibility: expanded ? "visible" : "hidden",
            transition: expanded
              ? `opacity ${FADE}`
              : `opacity ${FADE}, visibility 0s linear 300ms`,
          }}
        >
          {channels.map((channel, index) => (
            // The wrapper animates open/close; the inner button keeps its own
            // hover transition, so the stagger delay never slows down hover.
            <div
              className="will-change-transform motion-reduce:transition-none!"
              key={channel.id}
              style={{
                opacity: expanded ? 1 : 0,
                transform: expanded ? "none" : "translateY(30px)",
                transition: slideTransition(
                  expanded
                    ? OPEN_LEAD_MS + index * STAGGER_MS
                    : (channels.length - 1 - index) * STAGGER_MS,
                ),
              }}
            >
              <span className={BUTTON_CLASS_NAME}>
                {/* biome-ignore lint/performance/noImgElement: mirrors the embed script's static icon asset */}
                <img
                  alt={channel.name}
                  className="size-full"
                  height={56}
                  src={getWidgetIconUrl(channel.channel)}
                  title={channel.name}
                  width={56}
                />
              </span>
            </div>
          ))}
        </div>

        <button
          aria-expanded={expanded}
          aria-label={name}
          className={cn(BUTTON_CLASS_NAME, "cursor-pointer active:scale-95")}
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {/* biome-ignore lint/performance/noImgElement: tenant icon URL from storage, same image the embed script shows */}
          <img
            alt={name}
            className="size-full object-cover"
            height={56}
            src={faviconUrl || fallbackLogoUrl}
            width={56}
          />
        </button>

        {/* Shown only while the channels are open; keeps its room when hidden
            so the toggle never shifts. */}
        <small
          aria-hidden={!expanded}
          className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-slate-500 leading-none motion-reduce:transition-none!"
          style={{
            opacity: expanded ? 1 : 0,
            visibility: expanded ? "visible" : "hidden",
            transform: expanded ? "none" : "translateY(5px)",
            transition: expanded
              ? slideTransition(POWERED_BY_DELAY_MS)
              : `${slideTransition(POWERED_BY_DELAY_MS)}, visibility 0s linear 650ms`,
          }}
        >
          <svg
            aria-hidden="true"
            fill="#ecc94b"
            height="8"
            stroke="#ecc94b"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="8"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span>{t("reflinks.chatWidget.poweredBy")}</span>
          <span className="text-blue-500 underline">{name}</span>
        </small>
      </div>
    </div>
  )
}
