"use client"

import type { CallTranscriptSegment } from "@chatbotx.io/business"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@chatbotx.io/ui/components/ui/sheet"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircleIcon,
  PlayIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import {
  memo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { getCallSummaryAction } from "../actions/get-call-summary.action"
import { getCallTranscriptAction } from "../actions/get-call-transcript.action"
import { createResolveCallRecordingUrl } from "../lib/resolve-call-recording-url"
import {
  type CallInfoSheetTab,
  useCallInfoSheetStore,
} from "../store/call-info-sheet-store"
import { useCallPlaybackStore } from "../store/call-playback-store"
import { CallAudioPlayer } from "./call-audio-player"
import { WhatsappCallAiSummaryDialog } from "./whatsapp-call-ai-summary-dialog"

const formatTimestamp = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00"
  }
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}

const resolveRecordingUrl = (whatsappCallId: string, workspaceId: string) =>
  createResolveCallRecordingUrl({
    workspaceId,
    whatsappCallId,
    context: "Whatsapp call info sheet",
  })

/** Matches a transcript segment against the search query, on speaker name or text. */
const matchesSearch = (
  segment: CallTranscriptSegment,
  speakerName: string | undefined,
  query: string,
): boolean => {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return (
    segment.text.toLowerCase().includes(needle) ||
    Boolean(speakerName?.toLowerCase().includes(needle))
  )
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}|[\]\\]/g, "\\$&")

/** Wraps every case-insensitive occurrence of query in text with <mark>. */
const highlightMatch = (text: string, query: string): ReactNode => {
  const needle = query.trim()
  if (!needle) {
    return text
  }
  // The capturing group in split puts every match at an odd index. Keying each
  // piece by its character offset gives a stable key.
  let offset = 0
  return text
    .split(new RegExp(`(${escapeRegExp(needle)})`, "gi"))
    .map((part) => {
      const key = offset
      offset += part.length
      return part.toLowerCase() === needle.toLowerCase() ? (
        <mark
          className="rounded-sm bg-yellow-200 text-inherit dark:bg-yellow-300/30"
          key={key}
        >
          {part}
        </mark>
      ) : (
        part
      )
    })
}

/**
 * Memoized so an active-segment change (which flips isActive on exactly two
 * rows) never re-renders every other row in a long transcript.
 */
const TranscriptRow = memo(
  ({
    segment,
    speakerName,
    isActive,
    search,
    workspaceId,
    whatsappCallId,
  }: {
    segment: CallTranscriptSegment
    speakerName: string | undefined
    isActive: boolean
    search: string
    workspaceId: string
    whatsappCallId: string
  }) => {
    const t = useTranslations("whatsapp.calls.sheet")
    const rowRef = useRef<HTMLButtonElement>(null)
    const play = useCallPlaybackStore((state) => state.play)
    const seek = useCallPlaybackStore((state) => state.seek)

    useEffect(() => {
      // jsdom (unit tests) has no scrollIntoView implementation.
      if (isActive && typeof rowRef.current?.scrollIntoView === "function") {
        rowRef.current.scrollIntoView({ block: "nearest" })
      }
    }, [isActive])

    const handlePlay = async () => {
      await play(
        whatsappCallId,
        resolveRecordingUrl(whatsappCallId, workspaceId),
      )
      seek(segment.start)
    }

    return (
      <button
        aria-current={isActive ? "true" : undefined}
        className={`flex w-full flex-col gap-1 rounded-md p-2 text-left transition-colors ${
          isActive ? "bg-accent" : "hover:bg-muted"
        }`}
        onClick={handlePlay}
        ref={rowRef}
        type="button"
      >
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {speakerName && (
            <span className="font-medium">
              {highlightMatch(speakerName, search)}
            </span>
          )}
          <span className="inline-flex items-center gap-1 tabular-nums">
            <PlayIcon aria-hidden className="size-3" />
            <span className="sr-only">{t("playSegment")}</span>
            {formatTimestamp(segment.start)}
          </span>
        </div>
        <span className="block text-sm">
          {highlightMatch(segment.text, search)}
        </span>
      </button>
    )
  },
)
TranscriptRow.displayName = "TranscriptRow"

type TranscriptData = {
  segments: CallTranscriptSegment[]
  speakerNames: { business: string; customer: string }
  hasSpeakers: boolean
}

/**
 * Module-level, not a closure over component state, so it's a stable reference
 * — passing hasSpeakers/speakerNames explicitly avoids the "recreated every
 * render" hook-dependency problem.
 */
const resolveSpeakerName = (
  speaker: string | undefined,
  hasSpeakers: boolean,
  speakerNames: TranscriptData["speakerNames"] | undefined,
): string | undefined => {
  if (!(hasSpeakers && speaker && speakerNames)) {
    return
  }
  return speaker === "Business" ? speakerNames.business : speakerNames.customer
}

const TranscriptTab = ({
  workspaceId,
  whatsappCallId,
  isLoading,
  isError,
  onRetry,
  data,
}: {
  workspaceId: string
  whatsappCallId: string
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  data: TranscriptData | undefined
}) => {
  const t = useTranslations("whatsapp.calls.sheet")
  const tActions = useTranslations("actions")
  const [search, setSearch] = useState("")
  const [activeIndex, setActiveIndex] = useState(-1)
  const activeIndexRef = useRef(-1)

  const segments = data?.segments ?? []
  const speakerNames = data?.speakerNames
  const hasSpeakers = data?.hasSpeakers ?? false

  const filteredSegments = useMemo(() => {
    const withNames = segments.map((segment, index) => ({
      segment,
      index,
      speakerName: resolveSpeakerName(
        segment.speaker,
        hasSpeakers,
        speakerNames,
      ),
    }))
    return withNames.filter(({ segment, speakerName }) =>
      matchesSearch(segment, speakerName, search),
    )
  }, [segments, search, hasSpeakers, speakerNames])

  // Throttled active-segment tracking: only re-render when the active segment
  // index actually changes, never on every audio timeupdate tick.
  const currentTime = useCallPlaybackStore((state) =>
    state.callId === whatsappCallId ? state.currentTime : -1,
  )
  useEffect(() => {
    const nextIndex =
      currentTime < 0
        ? -1
        : segments.findIndex(
            (segment) =>
              currentTime >= segment.start && currentTime < segment.end,
          )
    if (nextIndex !== activeIndexRef.current) {
      activeIndexRef.current = nextIndex
      setActiveIndex(nextIndex)
    }
  }, [currentTime, segments])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  }

  // A network/authorization failure is a distinct state from "the transcript
  // succeeded but came back empty" — showing the unavailable copy on an error
  // told the agent it could never be transcribed when a retry might work.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 p-4 text-center">
        <AlertCircleIcon aria-hidden className="size-6 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">{t("transcriptError")}</p>
        <Button onClick={onRetry} size="sm" variant="secondary">
          {tActions("retry")}
        </Button>
      </div>
    )
  }

  if (segments.length === 0) {
    return (
      <p className="p-4 text-muted-foreground text-sm">
        {t("transcriptUnavailable")}
      </p>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden">
      <div className="relative px-4 pt-2">
        <SearchIcon
          aria-hidden
          className="absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={t("searchLabel")}
          className="ps-8"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          value={search}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {filteredSegments.length === 0 ? (
          <p className="p-4 text-muted-foreground text-sm">
            {t("noSearchResults")}
          </p>
        ) : (
          filteredSegments.map(({ segment, index, speakerName }) => (
            <TranscriptRow
              isActive={index === activeIndex}
              key={`${segment.start}-${index}`}
              search={search}
              segment={segment}
              speakerName={speakerName}
              whatsappCallId={whatsappCallId}
              workspaceId={workspaceId}
            />
          ))
        )}
      </div>
    </div>
  )
}

const SummaryTab = ({
  workspaceId,
  whatsappCallId,
  hasTranscript,
}: {
  workspaceId: string
  whatsappCallId: string
  hasTranscript: boolean
}) => {
  const t = useTranslations("whatsapp.calls.sheet")
  const tActions = useTranslations("actions")
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const summaryQueryKey = ["whatsapp-call-summary", workspaceId, whatsappCallId]

  const summaryQuery = useQuery({
    queryKey: summaryQueryKey,
    queryFn: async () => {
      const result = await getCallSummaryAction(workspaceId, {
        whatsappCallId,
      })
      return result?.data?.result
    },
  })

  const summary = summaryQuery.data?.aiSummary
  const hasSummary = Boolean(summary)

  if (summaryQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {hasSummary && summary ? (
        <>
          <p className="text-sm">{summary.summary}</p>
          {summary.keyPoints && summary.keyPoints.length > 0 && (
            <div>
              <h3 className="mb-1 font-medium text-sm">
                {t("summaryKeyPoints")}
              </h3>
              <ul className="list-inside list-disc text-sm">
                {summary.keyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.actionItems && summary.actionItems.length > 0 && (
            <div>
              <h3 className="mb-1 font-medium text-sm">
                {t("summaryActionItems")}
              </h3>
              <ul className="list-inside list-disc text-sm">
                {summary.actionItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button className="self-start" size="sm" variant="secondary">
                  {t("regenerate")}
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("regenerateConfirmTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("regenerateConfirmDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tActions("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault()
                    setDialogOpen(true)
                  }}
                >
                  {t("regenerate")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <SparklesIcon aria-hidden className="size-6 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">{t("summaryEmpty")}</p>
          <Button onClick={() => setDialogOpen(true)} size="sm">
            {t("generateSummary")}
          </Button>
        </div>
      )}

      <WhatsappCallAiSummaryDialog
        hasTranscript={hasTranscript}
        onGenerated={(result) => {
          // Writes straight into the react-query cache instead of local state,
          // so reopening the sheet later reads the new summary immediately
          // rather than flashing stale cache before a refetch lands.
          queryClient.setQueryData(summaryQueryKey, { aiSummary: result })
        }}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        whatsappCallId={whatsappCallId}
      />
    </div>
  )
}

/**
 * The Call Information side sheet — the shared playback owner
 * (callPlaybackStore) means the audio player here and on the progressive call
 * card never fight over the one <audio> element. Mounted once and driven
 * entirely by callInfoSheetStore.
 */
export const WhatsappCallInfoSheet = () => {
  const t = useTranslations("whatsapp.calls.sheet")
  const workspaceId = useWorkspaceId()
  const isOpen = useCallInfoSheetStore((state) => state.isOpen)
  const whatsappCallId = useCallInfoSheetStore((state) => state.whatsappCallId)
  const storeTab = useCallInfoSheetStore((state) => state.tab)
  const durationSeconds = useCallInfoSheetStore(
    (state) => state.durationSeconds,
  )
  const close = useCallInfoSheetStore((state) => state.close)

  const [activeTab, setActiveTab] = useState<CallInfoSheetTab>(storeTab)

  useEffect(() => {
    if (isOpen) {
      setActiveTab(storeTab)
    }
    // Re-sync only when a new open call happens, never on the user's own in-
    // sheet tab clicks.
  }, [isOpen, storeTab])

  const transcriptQuery = useQuery({
    queryKey: ["whatsapp-call-transcript", workspaceId, whatsappCallId],
    queryFn: async () => {
      if (!whatsappCallId) {
        throw new Error("Whatsapp call info sheet: missing call id")
      }
      const result = await getCallTranscriptAction(workspaceId, {
        whatsappCallId,
      })
      if (!result?.data) {
        throw new Error("Failed to load transcript")
      }
      return result.data
    },
    enabled: isOpen && Boolean(whatsappCallId),
  })

  const hasTranscript = (transcriptQuery.data?.segments.length ?? 0) > 0

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          close()
        }
      }}
      open={isOpen}
    >
      <SheetContent className="sm:max-w-[400px]" side="right">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
        </SheetHeader>

        {whatsappCallId && (
          <>
            <div className="border-b px-4 pb-4">
              <CallAudioPlayer
                callId={whatsappCallId}
                resolveUrl={resolveRecordingUrl(whatsappCallId, workspaceId)}
                totalDurationSeconds={durationSeconds}
              />
            </div>

            <Tabs
              className="flex flex-1 flex-col overflow-hidden"
              onValueChange={(value) => setActiveTab(value as CallInfoSheetTab)}
              value={activeTab}
            >
              <TabsList className="mx-4">
                <TabsTrigger value="summary">{t("summaryTab")}</TabsTrigger>
                <TabsTrigger value="transcript">
                  {t("transcriptTab")}
                </TabsTrigger>
              </TabsList>
              <TabsContent
                className="flex flex-1 flex-col overflow-hidden"
                value="transcript"
              >
                <TranscriptTab
                  data={transcriptQuery.data}
                  isError={transcriptQuery.isError}
                  isLoading={transcriptQuery.isLoading}
                  onRetry={() => transcriptQuery.refetch()}
                  whatsappCallId={whatsappCallId}
                  workspaceId={workspaceId}
                />
              </TabsContent>
              <TabsContent className="overflow-y-auto" value="summary">
                <SummaryTab
                  hasTranscript={hasTranscript}
                  whatsappCallId={whatsappCallId}
                  workspaceId={workspaceId}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
