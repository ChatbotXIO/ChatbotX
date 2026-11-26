"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import {
  POSTING_SLOT_MAX_TIMES_PER_DAY,
  type PostingScheduleDay,
} from "@chatbotx.io/utils/posting-slots"
import { CopyIcon, PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useId, useState } from "react"
import { EDITOR_WEEKDAYS, isSlotTime } from "../lib/posting-schedule-draft"

/** One weekday of a posting schedule: on/off, its times, and copying them to other days. */
export const PostingDayRow = ({
  dayLabel,
  day,
  disabled,
  labelOf,
  onAddTime,
  onCopy,
  onEnabledChange,
  onRemoveTime,
}: {
  day: PostingScheduleDay
  dayLabel: string
  disabled: boolean
  labelOf: (weekday: number) => string
  onAddTime: (time: string) => void
  onCopy: (targets: number[]) => void
  onEnabledChange: (enabled: boolean) => void
  onRemoveTime: (time: string) => void
}) => {
  const t = useTranslations()
  const id = useId()
  const [newTime, setNewTime] = useState("")
  const [copying, setCopying] = useState(false)
  const [targets, setTargets] = useState<number[]>([])
  const isFull = day.times.length >= POSTING_SLOT_MAX_TIMES_PER_DAY

  const add = () => {
    if (!isSlotTime(newTime)) {
      return
    }
    onAddTime(newTime)
    setNewTime("")
  }
  const toggleTarget = (weekday: number, checked: boolean) =>
    setTargets((current) =>
      checked ? [...current, weekday] : current.filter((w) => w !== weekday),
    )
  const applyCopy = () => {
    onCopy(targets)
    setTargets([])
    setCopying(false)
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-3">
        <Switch
          aria-label={t("posts.connect.schedule.dayOn", { day: dayLabel })}
          checked={day.enabled}
          disabled={disabled}
          onCheckedChange={onEnabledChange}
        />
        <span className="w-28 shrink-0 font-medium text-sm">{dayLabel}</span>
        <Button
          aria-label={t("posts.connect.schedule.copyTo")}
          className="ms-auto size-7"
          disabled={disabled || day.times.length === 0}
          onClick={() => setCopying((open) => !open)}
          size="icon"
          title={t("posts.connect.schedule.copyTo")}
          type="button"
          variant="ghost"
        >
          <CopyIcon />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 ps-[3.25rem]">
        {day.times.length === 0 ? (
          <span className="text-muted-foreground text-xs">
            {t("posts.connect.schedule.noTimes")}
          </span>
        ) : (
          day.times.map((time) => (
            <span
              className={`inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 ps-2.5 pe-1 font-mono text-xs tabular-nums ${day.enabled ? "" : "opacity-50"}`}
              key={time}
            >
              {time}
              <button
                aria-label={t("posts.connect.schedule.removeTime", { time })}
                className="rounded-full p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                disabled={disabled}
                onClick={() => onRemoveTime(time)}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))
        )}
        <span className="inline-flex items-center gap-1">
          <Input
            aria-label={t("posts.connect.schedule.timeLabel", {
              day: dayLabel,
            })}
            className="h-7 w-[6.5rem] text-xs"
            disabled={disabled || isFull}
            onChange={(event) => setNewTime(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                add()
              }
            }}
            type="time"
            value={newTime}
          />
          <Button
            aria-label={t("posts.connect.schedule.addTime")}
            className="size-7"
            disabled={disabled || isFull || !isSlotTime(newTime)}
            onClick={add}
            size="icon"
            title={
              isFull
                ? t("posts.connect.schedule.maxTimes", {
                    count: POSTING_SLOT_MAX_TIMES_PER_DAY,
                  })
                : t("posts.connect.schedule.addTime")
            }
            type="button"
            variant="outline"
          >
            <PlusIcon />
          </Button>
        </span>
      </div>
      {copying ? (
        <fieldset className="ms-[3.25rem] flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 p-2">
          <legend className="sr-only">
            {t("posts.connect.schedule.copyTo")}
          </legend>
          {EDITOR_WEEKDAYS.filter((weekday) => weekday !== day.weekday).map(
            (weekday) => (
              <Label
                className="gap-1.5 font-normal text-xs"
                htmlFor={`${id}-${weekday}`}
                key={weekday}
              >
                <Checkbox
                  checked={targets.includes(weekday)}
                  id={`${id}-${weekday}`}
                  onCheckedChange={(checked) =>
                    toggleTarget(weekday, checked === true)
                  }
                />
                {labelOf(weekday)}
              </Label>
            ),
          )}
          <Button
            className="ms-auto"
            disabled={targets.length === 0}
            onClick={applyCopy}
            size="sm"
            type="button"
          >
            {t("posts.connect.schedule.copyApply")}
          </Button>
        </fieldset>
      ) : null}
    </li>
  )
}
