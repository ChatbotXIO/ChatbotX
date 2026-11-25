"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  type RecurrenceRule,
  recurrenceRuleSchema,
} from "@chatbotx.io/utils/recurrence"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect, useId } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { buildDefaultRecurrenceRule } from "@/components/recurrence/recurrence-defaults"
import { RecurrenceRuleFields } from "@/components/recurrence/recurrence-rule-fields"
import { orpc } from "@/lib/orpc/query"
import type { ComposerPost } from "../lib/composer-state"
import { invalidateSocialPost } from "../lib/invalidate-social-post"
import { RecurrenceOccurrences } from "./recurrence-occurrences"

const formSchema = z.object({ recurrence: recurrenceRuleSchema })

type ExistingSeries = NonNullable<ComposerPost["recurrence"]>

/** Whether the series is still making copies (running or paused). */
const isOpenSeries = (
  series: ExistingSeries | null | undefined,
): series is ExistingSeries => Boolean(series && series.state !== "ended")

/** The rule the form starts from: the running series', else none. */
export const initialRepeat = (
  post: ComposerPost | undefined,
): RecurrenceRule | null =>
  isOpenSeries(post?.recurrence) ? post.recurrence.rule : null

const sortedJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  )

/**
 * The rule to send with a save: `undefined` when the series already runs under
 * this very rule, so saving the content never restarts it.
 */
export const repeatToSend = (
  repeat: RecurrenceRule | null,
  post: ComposerPost | undefined,
): RecurrenceRule | undefined => {
  if (!repeat) {
    return
  }
  const stored = isOpenSeries(post?.recurrence) ? post.recurrence.rule : null
  return stored && sortedJson(stored) === sortedJson(repeat)
    ? undefined
    : repeat
}

export const isRepeatValid = (repeat: RecurrenceRule | null): boolean =>
  repeat === null || recurrenceRuleSchema.safeParse(repeat).success

/** The repeat editor, mounted only while "Repeat" is on; it reports each edit upward. */
const RepeatFields = ({
  onChange,
  value,
}: {
  onChange: (rule: RecurrenceRule) => void
  value: RecurrenceRule
}) => {
  const form = useForm<z.input<typeof formSchema>>({
    defaultValues: { recurrence: value },
    mode: "onChange",
    resolver: zodResolver(formSchema),
  })
  const rule = useWatch({ control: form.control, name: "recurrence" })
  useEffect(() => {
    onChange(rule as RecurrenceRule)
  }, [rule, onChange])
  return (
    <Form {...form}>
      <RecurrenceRuleFields namePrefix="recurrence" occurrenceCount={0} />
    </Form>
  )
}

/** Pause, resume and end of a series that already exists. */
const SeriesStatus = ({
  disabled,
  onEnded,
  series,
  socialPostId,
  workspaceId,
}: {
  /** The workspace is read-only: the server refuses to resume a series. */
  disabled: boolean
  /** The series was ended: the editor must stop holding its rule. */
  onEnded: () => void
  series: ExistingSeries
  socialPostId: string
  workspaceId: string
}) => {
  const t = useTranslations("composer")
  const tRoot = useTranslations()
  const format = useFormatter()
  const queryClient = useQueryClient()
  const refresh = async () => {
    await invalidateSocialPost(queryClient, workspaceId, socialPostId)
    toast.success(t("repeatUpdated"))
  }
  const onError = (error: Error) => toast.error(error.message)
  const pause = useMutation(
    orpc.socialPostsAPIs.privatePauseSocialPostRecurrenceAPI.mutationOptions({
      onError,
      onSuccess: refresh,
    }),
  )
  const resume = useMutation(
    orpc.socialPostsAPIs.privateResumeSocialPostRecurrenceAPI.mutationOptions({
      onError,
      onSuccess: refresh,
    }),
  )
  const end = useMutation(
    orpc.socialPostsAPIs.privateEndSocialPostRecurrenceAPI.mutationOptions({
      onError,
      onSuccess: async () => {
        // Drop the rule first: a later Save must not send it and restart the series.
        onEnded()
        await refresh()
      },
    }),
  )
  const input = { id: socialPostId, workspaceId }
  const busy = pause.isPending || resume.isPending || end.isPending
  const isPaused = series.state === "paused"
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">
        {isPaused ? t("repeatStatePaused") : t("repeatStateActive")}
      </span>
      {series.nextRunAt && !isPaused ? (
        <span className="text-muted-foreground">
          {t("repeatNextRun", {
            date: format.dateTime(series.nextRunAt, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: series.rule.timezone,
            }),
          })}
        </span>
      ) : null}
      <span className="ms-auto flex gap-2">
        {isPaused ? (
          <Button
            disabled={busy || disabled}
            onClick={() => resume.mutate(input)}
            size="sm"
            title={disabled ? tRoot("posts.calendar.readOnly") : undefined}
            type="button"
            variant="outline"
          >
            {t("repeatResume")}
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={() => pause.mutate(input)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("repeatPause")}
          </Button>
        )}
        <Button
          disabled={busy}
          onClick={() => end.mutate(input)}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("repeatEnd")}
        </Button>
      </span>
    </div>
  )
}

/**
 * "Repeat": turns the post into the template of a series and reveals the shared
 * repeat editor. A series that already exists is managed here too (pause,
 * resume, end); it can only be switched off by ending it.
 */
export const RepeatControl = ({
  disabled,
  onChange,
  repeat,
  series,
  socialPostId,
  timezone,
  workspaceId,
}: {
  disabled: boolean
  onChange: (rule: RecurrenceRule | null) => void
  repeat: RecurrenceRule | null
  series: ExistingSeries | null | undefined
  socialPostId: string | undefined
  timezone: string
  workspaceId: string
}) => {
  const t = useTranslations("composer")
  const id = useId()
  const open = isOpenSeries(series)
  return (
    <section className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={repeat !== null}
          disabled={disabled || open}
          id={id}
          onCheckedChange={(checked) =>
            onChange(
              checked ? buildDefaultRecurrenceRule(timezone, new Date()) : null,
            )
          }
        />
        <Label htmlFor={id}>{t("repeatLabel")}</Label>
        {series?.state === "ended" ? (
          <span className="text-muted-foreground text-xs">
            {t("repeatStateEnded")}
          </span>
        ) : null}
      </div>
      {open && socialPostId ? (
        <SeriesStatus
          disabled={disabled}
          onEnded={() => onChange(null)}
          series={series}
          socialPostId={socialPostId}
          workspaceId={workspaceId}
        />
      ) : null}
      {series && socialPostId ? (
        <RecurrenceOccurrences
          disabled={disabled}
          series={series}
          socialPostId={socialPostId}
          workspaceId={workspaceId}
        />
      ) : null}
      {repeat ? (
        <>
          <p className="text-muted-foreground text-xs">{t("repeatHint")}</p>
          <fieldset className="border-0 p-0" disabled={disabled}>
            <RepeatFields onChange={onChange} value={repeat} />
          </fieldset>
        </>
      ) : null}
    </section>
  )
}
