"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use, useState } from "react"
import { toast } from "sonner"
import { updateResponseSlaAction } from "../actions/update-response-sla.action"
import { useInvalidateResponseSlaStatus } from "../provider/response-sla-hook"
import type { ResponseSlaResource } from "../schema/resource"

const SECONDS_PER_MINUTE = 60
const DEFAULT_FIRST_RESPONSE_MINUTES = 60
const DEFAULT_THRESHOLD_PERCENT = 25
const MAX_TARGET_MINUTES = 43_200 // 30 days, the API's upper bound

type Draft = {
  enabled: boolean
  first: string
  next: string
  threshold: string
}

const toDraft = (policy: ResponseSlaResource | null): Draft => ({
  // No policy yet = off; the numbers below are only suggestions until saved.
  enabled: policy?.enabled ?? false,
  first: String(
    policy
      ? policy.firstResponseTargetSeconds / SECONDS_PER_MINUTE
      : DEFAULT_FIRST_RESPONSE_MINUTES,
  ),
  next:
    policy?.nextResponseTargetSeconds == null
      ? ""
      : String(policy.nextResponseTargetSeconds / SECONDS_PER_MINUTE),
  threshold: String(
    policy?.breachingThresholdPercent ?? DEFAULT_THRESHOLD_PERCENT,
  ),
})

/** Whole positive minutes -> seconds; `null` for blank/invalid. */
const minutesToSeconds = (value: string): number | null => {
  const minutes = Number(value)
  return value.trim() !== "" &&
    Number.isFinite(minutes) &&
    minutes >= 1 &&
    minutes <= MAX_TARGET_MINUTES
    ? Math.round(minutes * SECONDS_PER_MINUTE)
    : null
}

export function ResponseSlaCard({
  workspaceId,
  promise,
}: {
  workspaceId: string
  promise: Promise<ResponseSlaResource | null>
}) {
  const t = useTranslations()
  const router = useRouter()
  const invalidateStatus = useInvalidateResponseSlaStatus()
  const policy = use(promise)
  const [draft, setDraft] = useState<Draft>(() => toDraft(policy))

  const save = useAction(updateResponseSlaAction.bind(null, workspaceId), {
    onError: ({ error }) => {
      // The switch shows what the server holds: a rejected save puts it back.
      if (policy) {
        setDraft((current) => ({ ...current, enabled: policy.enabled }))
      }
      toast.error(error.serverError ?? t("messages.error"))
    },
    onSuccess: () => {
      invalidateStatus()
      toast.success(
        t("messages.updatedSuccess", { feature: t("responseSla.label") }),
      )
      router.refresh()
    },
  })
  // With a saved policy the switch applies at once (its targets are kept);
  // without one it only reveals the form, and Save creates the policy.
  const onToggle = (enabled: boolean) => {
    setDraft({ ...draft, enabled })
    if (policy) {
      save.execute({
        enabled,
        firstResponseTargetSeconds: policy.firstResponseTargetSeconds,
        nextResponseTargetSeconds: policy.nextResponseTargetSeconds,
        breachingThresholdPercent: policy.breachingThresholdPercent,
      })
    }
  }

  const firstSeconds = minutesToSeconds(draft.first)
  const nextSeconds =
    draft.next.trim() === "" ? null : minutesToSeconds(draft.next)
  const threshold = Number(draft.threshold)
  const nextInvalid = draft.next.trim() !== "" && nextSeconds === null
  const thresholdInvalid =
    !Number.isInteger(threshold) || threshold < 1 || threshold > 99
  const valuesValid = firstSeconds !== null && !nextInvalid && !thresholdInvalid
  const canSave = valuesValid && !save.isPending
  const busy = save.isPending

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <CardTitle className="font-bold text-xl">
            {t("responseSla.title")}
          </CardTitle>
          <CardDescription>{t("responseSla.description")}</CardDescription>
        </div>
        <Switch
          aria-label={t("responseSla.enable")}
          checked={draft.enabled}
          disabled={busy}
          onCheckedChange={onToggle}
        />
      </CardHeader>
      {draft.enabled && (
        <CardContent>
          <form
            className="grid max-w-xl gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (canSave && firstSeconds !== null) {
                save.execute({
                  enabled: draft.enabled,
                  firstResponseTargetSeconds: firstSeconds,
                  nextResponseTargetSeconds: nextSeconds,
                  breachingThresholdPercent: threshold,
                })
              }
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="sla-first">{t("responseSla.firstTarget")}</Label>
              <Input
                disabled={busy}
                id="sla-first"
                max={MAX_TARGET_MINUTES}
                min={1}
                onChange={(event) =>
                  setDraft({ ...draft, first: event.target.value })
                }
                required
                step="any"
                type="number"
                value={draft.first}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sla-next">{t("responseSla.nextTarget")}</Label>
              <Input
                aria-invalid={nextInvalid}
                disabled={busy}
                id="sla-next"
                max={MAX_TARGET_MINUTES}
                min={1}
                onChange={(event) =>
                  setDraft({ ...draft, next: event.target.value })
                }
                placeholder={t("responseSla.nextPlaceholder")}
                step="any"
                type="number"
                value={draft.next}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sla-threshold">
                {t("responseSla.threshold")}
              </Label>
              <Input
                aria-invalid={thresholdInvalid}
                disabled={busy}
                id="sla-threshold"
                max={99}
                min={1}
                onChange={(event) =>
                  setDraft({ ...draft, threshold: event.target.value })
                }
                required
                type="number"
                value={draft.threshold}
              />
              <p className="text-muted-foreground text-xs">
                {t("responseSla.thresholdHelp")}
              </p>
            </div>
            <p className="text-muted-foreground text-xs">
              {t("responseSla.workingTimeNote")}
            </p>
            <div className="flex items-center gap-2">
              <Button disabled={!canSave} type="submit">
                {save.isPending && <Loader2Icon className="animate-spin" />}
                {t("actions.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  )
}

export function ResponseSlaCardFallback() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  )
}
