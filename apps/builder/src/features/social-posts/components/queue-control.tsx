"use client"

import type { SocialQueuePosition } from "@chatbotx.io/utils/social-post"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { connectTabPath } from "@/features/social-accounts/lib/connect-route"
import type { DestinationFreeSlots } from "../hooks/use-free-slots"
import { CountedToggleGroup } from "./counted-toggle-group"

export type ScheduleMode = "time" | SocialQueuePosition

const PREVIEW_SLOTS = 3

/** Where the post goes: a time of its own, or the destinations' queues (next free slot / top). */
export const ScheduleModeToggle = ({
  disabled,
  mode,
  onChange,
}: {
  disabled: boolean
  mode: ScheduleMode
  onChange: (mode: ScheduleMode) => void
}) => {
  const t = useTranslations()
  return (
    <fieldset className="min-w-0 border-0 p-0" disabled={disabled}>
      <CountedToggleGroup<ScheduleMode>
        label={t("composer.queue.modeLabel")}
        onChange={onChange}
        options={[
          {
            count: undefined,
            label: t("composer.queue.atTime"),
            value: "time",
          },
          { count: undefined, label: t("composer.queue.next"), value: "next" },
          { count: undefined, label: t("composer.queue.top"), value: "top" },
        ]}
        value={mode}
      />
    </fieldset>
  )
}

/**
 * The next free posting time(s) of every selected destination's queue, or why a
 * destination cannot take the post: a person's queue needs a posting schedule.
 */
export const QueuePreview = ({
  mode,
  names,
  slots,
  workspaceId,
}: {
  mode: SocialQueuePosition
  names: ReadonlyMap<string, string>
  slots: readonly DestinationFreeSlots[]
  workspaceId: string
}) => {
  const t = useTranslations()
  const format = useFormatter()

  if (slots.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("composer.queue.noDestination")}
      </p>
    )
  }
  const missing = slots.filter(
    (slot) => !(slot.isPending || slot.isError) && slot.items.length === 0,
  )
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        {mode === "top"
          ? t("composer.queue.topHint")
          : t("composer.queue.nextHint")}
      </p>
      <ul className="space-y-1.5">
        {slots.map((slot) => {
          const name = names.get(slot.destinationId) ?? ""
          const first = slot.items[0]
          return (
            <li
              className="flex flex-wrap items-baseline gap-x-2 text-sm"
              key={slot.destinationId}
            >
              <span className="font-medium">{name}</span>
              {slot.isError ? (
                <span className="text-destructive">
                  {t("messages.errorLoadingData")}
                </span>
              ) : null}
              {slot.isPending ? (
                <span className="text-muted-foreground">…</span>
              ) : null}
              {first && slot.timezone ? (
                <span className="text-muted-foreground tabular-nums">
                  {slot.items.slice(0, PREVIEW_SLOTS).map((item, index) => (
                    <span key={item.getTime()}>
                      {index > 0 ? " · " : ""}
                      {format.dateTime(item, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: slot.timezone,
                      })}
                    </span>
                  ))}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
      {missing.length > 0 ? (
        <p className="text-destructive text-sm" role="alert">
          {t("composer.queue.noSchedule", {
            names: missing
              .map((slot) => names.get(slot.destinationId))
              .join(", "),
          })}{" "}
          <Link
            className="font-medium underline underline-offset-2"
            href={connectTabPath(workspaceId)}
          >
            {t("composer.queue.setUpSlots")}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
