"use client"

import type { MessageWhatsappCallRecordingEntity } from "@chatbotx.io/sdk"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@chatbotx.io/ui/components/ui/collapsible"
import { ChevronDownIcon, FileTextIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import type { AttachmentResource } from "@/features/attachments/schema/resource"
import { useAttachmentUrl } from "@/features/attachments/utils"
import { useWorkspaceId } from "@/hooks/routing"

type CallRecordingActivityProps = {
  attachment: AttachmentResource | undefined
  recording: MessageWhatsappCallRecordingEntity
}

/**
 * Renders the audio player + (once available) transcript for a WhatsApp
 * call-recording activity message — benefits both SIP and VoIP calls, which
 * attach to the same `WhatsappCall` row/message shape. Replaces the generic
 * `RenderAttachments` audio rendering for this one content type (see
 * `message-item.tsx`) so the player can refresh its own signed URL instead
 * of trusting a URL that may already be past its 15-minute TTL.
 */
export const CallRecordingActivity = (props: CallRecordingActivityProps) => {
  const { attachment, recording } = props
  const t = useTranslations("whatsapp.calls")
  const workspaceId = useWorkspaceId()
  const initialUrl = useAttachmentUrl(attachment)
  const [src, setSrc] = useState(initialUrl)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false)

  // The attachment's own `url` can change across re-renders (e.g. a newer
  // page fetch re-presigned it) independently of this component's own
  // on-demand refresh — stay in sync with it rather than freezing on the
  // very first render's value.
  useEffect(() => {
    setSrc(initialUrl)
  }, [initialUrl])

  // The server action (and everything it drags in — the business layer, the
  // real DB client) is loaded on demand rather than at module scope: this
  // component sits on the hot path of every rendered message list, and a
  // static import here would pull that whole graph into any test (or
  // client bundle) that merely renders a message, never just the handful of
  // recording messages that actually play audio.
  const refreshUrl = (): void => {
    if (isRefreshing) {
      return
    }
    setIsRefreshing(true)
    import("../actions/get-call-recording-url.action")
      .then(({ getCallRecordingUrlAction }) =>
        getCallRecordingUrlAction(workspaceId, {
          whatsappCallId: recording.callId,
        }),
      )
      .then((result) => {
        if (result?.data?.url) {
          setSrc(result.data.url)
        }
      })
      .catch(() => {
        // Best-effort refresh — the <audio> element simply stays unplayable
        // and the existing error state (native browser controls) is enough
        // feedback; nothing here is worth surfacing as a toast.
      })
      .finally(() => {
        setIsRefreshing(false)
      })
  }

  if (!attachment) {
    return null
  }

  return (
    <div className="flex flex-col gap-1.5">
      <audio
        controls
        // Refresh ONLY on error — a fresh presigned URL differs on every
        // mint, and swapping `src` on an already-playing element aborts
        // playback (the HTML media load algorithm resets `paused` to
        // `true`). A stale/expired URL fails to load, `onError` fires
        // exactly once, and the refreshed `src` is ready for the user's
        // next play click.
        onError={refreshUrl}
        preload="metadata"
        src={src}
      >
        <track default kind="captions" />
      </audio>
      {recording.transcript && (
        <Collapsible onOpenChange={setIsTranscriptOpen} open={isTranscriptOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 self-start text-muted-foreground text-xs hover:text-foreground">
            <FileTextIcon aria-hidden className="size-3.5" />
            <span>
              {isTranscriptOpen
                ? t("recordingActivity.hideTranscript")
                : t("recordingActivity.showTranscript")}
            </span>
            <ChevronDownIcon
              aria-hidden
              className={`size-3.5 transition-transform ${
                isTranscriptOpen ? "rotate-180" : ""
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1.5">
            <p className="max-w-80 whitespace-pre-line rounded-lg bg-secondary/50 p-2.5 text-sm">
              {recording.transcript}
            </p>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
