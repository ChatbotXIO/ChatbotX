"use client"

import {
  BROADCAST_AUDIENCE_POSITION_MIN,
  BROADCAST_DEFAULT_SEND_RATE_PER_MINUTE,
  BROADCAST_MAX_SEND_RATE_PER_MINUTE,
} from "@chatbotx.io/database/partials"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { resolveSendLimitIssueKey } from "../lib/broadcast-send-limit"

/** One fixed width for every number input so the rows line up in the label/control grid. */
const RANGE_FIELD_CLASS_NAME = "w-32 shrink-0"

/**
 * The optional "Limit" block rendered under the contact filter for every
 * broadcast channel/subaction (see `create-broadcast-form.tsx`). Takes no
 * channel prop — it reads only `audienceRangeStart`/`audienceRangeEnd`/
 * `sendRatePerMinute` from the surrounding form, so it renders identically
 * regardless of which channel the broadcast targets.
 */
export function BroadcastSendLimitFields() {
  const t = useTranslations()
  const { formState, control, trigger } = useFormContext()

  const watchedAudienceRangeStart = useWatch({
    control,
    name: "audienceRangeStart",
  })
  const watchedAudienceRangeEnd = useWatch({
    control,
    name: "audienceRangeEnd",
  })

  // In `mode: "onChange"`, react-hook-form's per-field validation only ever
  // copies the changed field's OWN error back into `formState.errors`
  // (`schemaErrorLookup` in react-hook-form's resolver bridge) — a zod
  // `.refine` issue on the disjoint virtual path `audienceRange` is silently
  // dropped even though it makes `isValid` false. Re-triggering that one
  // path explicitly whenever either range bound changes is what actually
  // populates (or clears) `errors.audienceRange`. `trigger()` re-reads the
  // current values straight from react-hook-form's own state, so the two
  // watched values are never read in the body — only used to key the effect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: watchedAudienceRangeStart/End key the effect but trigger() re-reads current form state itself
  useEffect(() => {
    trigger("audienceRange")
  }, [watchedAudienceRangeStart, watchedAudienceRangeEnd, trigger])

  // The refine's virtual `path: ["audienceRange"]` means no input is bound to
  // that key, so react-hook-form never prints it via a plain `FormMessage` —
  // this is the one place that reads and renders it, mirroring
  // `whatsapp-call-hours-section.tsx`'s `ISSUE_LABEL_KEY` pattern.
  const issueKey = resolveSendLimitIssueKey(
    formState.errors.audienceRange?.message,
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-sm">
          {t("broadcasts.sendLimit.title")}
        </span>
        <span className="text-muted-foreground text-xs">
          {t("broadcasts.sendLimit.hint")}
        </span>
      </div>

      <div className="grid grid-cols-1 items-center gap-x-4 gap-y-3 sm:grid-cols-[max-content_1fr]">
        <span className="text-muted-foreground text-sm">
          {t("broadcasts.sendLimit.rangeLabel")}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            {t("broadcasts.sendLimit.fromLabel")}
          </span>
          <InputNumberField
            formItemClassName={RANGE_FIELD_CLASS_NAME}
            min={BROADCAST_AUDIENCE_POSITION_MIN}
            name="audienceRangeStart"
            placeholder={String(BROADCAST_AUDIENCE_POSITION_MIN)}
          />
          <span className="text-muted-foreground text-sm">
            {t("broadcasts.sendLimit.toLabel")}
          </span>
          <InputNumberField
            formItemClassName={RANGE_FIELD_CLASS_NAME}
            min={BROADCAST_AUDIENCE_POSITION_MIN}
            name="audienceRangeEnd"
            placeholder={t("broadcasts.sendLimit.allPlaceholder")}
          />
        </div>

        <span className="text-muted-foreground text-sm">
          {t("fields.sendRatePerMinute.label")}
        </span>
        <InputNumberField
          formItemClassName={RANGE_FIELD_CLASS_NAME}
          max={BROADCAST_MAX_SEND_RATE_PER_MINUTE}
          min={1}
          name="sendRatePerMinute"
          placeholder={String(BROADCAST_DEFAULT_SEND_RATE_PER_MINUTE)}
        />
      </div>

      {issueKey && (
        <p className="text-destructive text-sm" role="alert">
          {t(issueKey)}
        </p>
      )}
    </div>
  )
}
