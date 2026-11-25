"use client"

import type { RecurrenceRule } from "@chatbotx.io/utils/recurrence"
import { useTranslations } from "next-intl"
import type { DestinationFreeSlots } from "../hooks/use-free-slots"
import type { ComposerPost } from "../lib/composer-state"
import {
  QueuePreview,
  type ScheduleMode,
  ScheduleModeToggle,
} from "./queue-control"
import { isRepeatValid, RepeatControl } from "./repeat-control"
import { ScheduleControl } from "./schedule-control"

/** Repeat rule and one-off schedule: a repeating post is a template and is never scheduled itself. */
export const ComposerScheduleSection = ({
  disabled,
  destinationNames,
  freeSlots,
  isTooSoon,
  mode,
  onModeChange,
  onRepeatChange,
  onScheduleChange,
  repeat,
  scheduleAt,
  socialPost,
  timezone,
  workspaceId,
}: {
  disabled: boolean
  /** The selected destinations' names by id, for the queue preview. */
  destinationNames: ReadonlyMap<string, string>
  freeSlots: readonly DestinationFreeSlots[]
  isTooSoon: boolean
  mode: ScheduleMode
  onModeChange: (mode: ScheduleMode) => void
  onRepeatChange: (repeat: RecurrenceRule | null) => void
  onScheduleChange: (value: Date | undefined) => void
  repeat: RecurrenceRule | null
  scheduleAt: Date | undefined
  socialPost: ComposerPost | undefined
  timezone: string
  workspaceId: string
}) => {
  const t = useTranslations()

  return (
    <>
      {socialPost?.parentSocialPostId ? null : (
        <RepeatControl
          disabled={disabled}
          onChange={onRepeatChange}
          repeat={repeat}
          series={socialPost?.recurrence}
          socialPostId={socialPost?.id}
          timezone={timezone}
          workspaceId={workspaceId}
        />
      )}
      {repeat ? (
        <p className="text-muted-foreground text-sm">
          {t("composer.repeatScheduleOff")}
        </p>
      ) : (
        <div className="space-y-3">
          <ScheduleModeToggle
            disabled={disabled}
            mode={mode}
            onChange={onModeChange}
          />
          {mode === "time" ? (
            <ScheduleControl
              disabled={disabled}
              isTooSoon={isTooSoon}
              onChange={onScheduleChange}
              timezone={timezone}
              value={scheduleAt}
            />
          ) : (
            <QueuePreview
              mode={mode}
              names={destinationNames}
              slots={freeSlots}
              workspaceId={workspaceId}
            />
          )}
        </div>
      )}
      {repeat && !isRepeatValid(repeat) ? (
        <p className="text-destructive text-sm" role="alert">
          {t("composer.repeatInvalid")}
        </p>
      ) : null}
    </>
  )
}
