"use client"

import type { RecurrenceRule } from "@chatbotx.io/utils/recurrence"
import { useTimeZone } from "next-intl"
import { useCallback, useRef } from "react"
import { buildDefaultRecurrenceRule } from "./recurrence-defaults"

type RecurrenceRuleSwitchOptions = {
  read: () => RecurrenceRule | undefined
  write: (rule: RecurrenceRule | undefined) => void
  /** The rule saved on the broadcast, offered before a fresh default. */
  savedRule?: RecurrenceRule
}

/**
 * The rule half of a schedule-type select. Choosing "Repeat" gives the form a
 * rule (the one the user had edited, else the saved one, else a default in
 * their timezone); choosing anything else drops it so the server's "only when
 * recurring" check never sees a stale one, but remembers it for the way back.
 */
export function useRecurrenceRuleSwitch({
  read,
  write,
  savedRule,
}: RecurrenceRuleSwitchOptions) {
  const timeZone = useTimeZone()
  const lastRule = useRef<RecurrenceRule | undefined>(undefined)

  const selectScheduleType = useCallback(
    (isRecurring: boolean) => {
      const current = read()
      if (isRecurring) {
        if (!current) {
          write(
            lastRule.current ??
              savedRule ??
              buildDefaultRecurrenceRule(timeZone ?? "UTC", new Date()),
          )
        }
        return
      }
      if (current) {
        lastRule.current = current
        write(undefined)
      }
    },
    [read, write, savedRule, timeZone],
  )

  /** Forgets the remembered rule, e.g. when a form is reused for another broadcast. */
  const forget = useCallback(() => {
    lastRule.current = undefined
  }, [])

  return { selectScheduleType, forget }
}
