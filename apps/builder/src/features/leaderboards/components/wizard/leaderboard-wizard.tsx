"use client"

import type { LeaderboardPlatform } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Loader2Icon,
  SendIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { type FieldPath, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { createLeaderboardAction } from "../../actions/create-leaderboard.action"
import { updateLeaderboardAction } from "../../actions/update-leaderboard.action"
import { supportsFollowersOnly } from "../../lib/platforms"
import { useInvalidateLeaderboards } from "../../lib/use-invalidate-leaderboards"
import { flattenValidationErrors } from "../../lib/validation-errors"
import {
  buildLeaderboardWizardSchema,
  hasEnabledRule,
  type LeaderboardDefaultRules,
  type LeaderboardWizardInput,
  type LeaderboardWizardOutput,
  STEP_ONE_FIELDS,
  STEP_TWO_FIELDS,
  stepOfField,
} from "../../lib/wizard-schema"
import type { LeaderboardRow } from "../../queries"
import { type LeaderboardPlatformChannels, StepConfig } from "./step-config"
import { StepInfo } from "./step-info"
import { StepReview } from "./step-review"
import { WizardProgress } from "./wizard-progress"

type Step = 1 | 2 | 3

const HOUR_MS = 3_600_000
const WEEK_MS = 7 * 24 * HOUR_MS

type LeaderboardWizardProps = {
  workspaceId: string
  defaultRules: LeaderboardDefaultRules
  platformChannels: LeaderboardPlatformChannels
  minigameOptions: { label: string; value: string }[]
  leaderboard?: LeaderboardRow
}

function buildDefaultValues(
  defaultRules: LeaderboardDefaultRules,
  leaderboard: LeaderboardRow | undefined,
): LeaderboardWizardInput {
  if (leaderboard) {
    return {
      name: leaderboard.name,
      description: leaderboard.description,
      coverImageUrl: leaderboard.coverImageUrl,
      startsAt: new Date(leaderboard.startsAt).toISOString(),
      endsAt: new Date(leaderboard.endsAt).toISOString(),
      platform: leaderboard.platform,
      inboxId: leaderboard.inboxId,
      minigameId: leaderboard.minigameId,
      scope: leaderboard.scope,
      rules: leaderboard.rules,
      followersOnly: leaderboard.followersOnly,
      tagIds: leaderboard.tagIds,
      resetTime: leaderboard.resetTime,
      cooldownSeconds: leaderboard.cooldownSeconds,
      referralWelcomeFlowId: leaderboard.referralWelcomeFlowId,
      rewardSettings: leaderboard.rewardSettings,
    }
  }
  const start = Math.ceil(Date.now() / HOUR_MS) * HOUR_MS
  return {
    name: "",
    description: "",
    coverImageUrl: "",
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + WEEK_MS).toISOString(),
    platform: "messenger",
    inboxId: null,
    minigameId: null,
    scope: { postScope: "all", postIds: [], telegramChatIds: [] },
    rules: defaultRules.messenger,
    followersOnly: false,
    tagIds: [],
    resetTime: "22:00",
    cooldownSeconds: 0,
    referralWelcomeFlowId: null,
    rewardSettings: { flowId: null, topN: 3, autoOnFinish: false },
  }
}

/**
 * 3-step create/edit wizard. Create saves a draft (`leaderboardService.create`)
 * and optionally publishes it; edit saves in place. Platform, channel and
 * start time are locked once the leaderboard has been published.
 */
export function LeaderboardWizard({
  workspaceId,
  defaultRules,
  platformChannels,
  minigameOptions,
  leaderboard,
}: LeaderboardWizardProps) {
  const t = useTranslations()
  const router = useRouter()
  const invalidateLeaderboards = useInvalidateLeaderboards()
  const [step, setStep] = useState<Step>(1)
  const isEdit = Boolean(leaderboard)
  const isDraft = !leaderboard || leaderboard.status === "draft"
  const hostLocked = !isDraft

  const schema = useMemo(
    () =>
      buildLeaderboardWizardSchema({
        nameRequired: t("leaderboards.validation.nameRequired"),
        dateRequired: t("leaderboards.validation.dateRequired"),
        endsAfterStart: t("leaderboards.validation.endsAfterStart"),
        channelRequired: t("leaderboards.validation.channelRequired"),
        minigameRequired: t("leaderboards.validation.minigameRequired"),
        pointsRequired: t("leaderboards.validation.pointsRequired"),
        bonusMinutesRequired: t("leaderboards.validation.bonusMinutesRequired"),
        postsRequired: t("leaderboards.validation.postsRequired"),
        telegramChatsRequired: t(
          "leaderboards.validation.telegramChatsRequired",
        ),
      }),
    [t],
  )

  const form = useForm<
    LeaderboardWizardInput,
    unknown,
    LeaderboardWizardOutput
  >({
    resolver: zodResolver(schema),
    defaultValues: buildDefaultValues(defaultRules, leaderboard),
    mode: "onTouched",
  })
  const platform = useWatch({ control: form.control, name: "platform" })

  const applyServerErrors = (validationErrors: unknown) => {
    const errors = flattenValidationErrors(validationErrors)
    for (const { path, message } of errors) {
      form.setError(path as FieldPath<LeaderboardWizardInput>, { message })
    }
    const first = errors[0]
    if (first) {
      setStep(stepOfField(first.path))
      toast.error(first.message)
    }
  }

  const finish = (message: string) => {
    toast.success(message)
    invalidateLeaderboards()
    router.push(`/space/${workspaceId}/leaderboards`)
    router.refresh()
  }

  const createAction = useAction(
    createLeaderboardAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (!data) {
          return
        }
        if (data.publishError) {
          invalidateLeaderboards()
          toast.error(data.publishError)
          router.push(`/space/${workspaceId}/leaderboards/${data.id}/edit`)
          return
        }
        finish(
          data.published
            ? t("leaderboards.toast.published")
            : t("messages.createdSuccess", {
                feature: t("leaderboards.feature"),
              }),
        )
      },
      onError: ({ error }) => {
        if (error.validationErrors) {
          applyServerErrors(error.validationErrors)
          return
        }
        toast.error(error.serverError ?? t("messages.error"))
      },
    },
  )
  const updateAction = useAction(
    updateLeaderboardAction.bind(null, workspaceId, leaderboard?.id ?? ""),
    {
      onSuccess: ({ data }) =>
        finish(
          data?.published
            ? t("leaderboards.toast.published")
            : t("messages.updatedSuccess", {
                feature: t("leaderboards.feature"),
              }),
        ),
      onError: ({ error }) => {
        if (error.validationErrors) {
          applyServerErrors(error.validationErrors)
          return
        }
        toast.error(error.serverError ?? t("messages.error"))
      },
    },
  )
  const isPending = createAction.isPending || updateAction.isPending

  const handlePlatformChange = (next: LeaderboardPlatform) => {
    if (hostLocked || next === form.getValues("platform")) {
      return
    }
    form.setValue("platform", next, { shouldDirty: true })
    form.setValue("inboxId", null)
    form.setValue("minigameId", null)
    form.setValue("scope", {
      postScope: "all",
      postIds: [],
      telegramChatIds: [],
    })
    form.setValue("rules", defaultRules[next], { shouldDirty: true })
    if (!supportsFollowersOnly(next)) {
      form.setValue("followersOnly", false)
    }
    form.clearErrors()
  }

  const goToStep = async (target: Step) => {
    if (target > step) {
      const fields = step === 1 ? STEP_ONE_FIELDS : STEP_TWO_FIELDS
      const valid = await form.trigger([...fields])
      if (!valid) {
        toast.error(t("leaderboards.validation.fixErrors"))
        return
      }
    }
    setStep(target)
    window.scrollTo({ top: 0 })
  }

  const submit = (publish: boolean) =>
    form.handleSubmit(
      (values) => {
        if (publish && !hasEnabledRule(values.rules)) {
          toast.error(t("leaderboards.validation.enableOneRule"))
          setStep(2)
          return
        }
        const payload = { ...values, publish }
        if (leaderboard) {
          updateAction.execute(payload)
        } else {
          createAction.execute(payload)
        }
      },
      (errors) => {
        const firstField = Object.keys(errors)[0]
        setStep(firstField ? stepOfField(firstField) : 1)
        toast.error(t("leaderboards.validation.fixErrors"))
      },
    )()

  const viewUrl = leaderboard?.viewUrl ?? null

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-4">
          <h1 className="font-semibold text-lg">
            {isEdit
              ? t("messages.editFeature", {
                  feature: t("leaderboards.feature"),
                })
              : t("leaderboards.create")}
          </h1>
          <WizardProgress step={step} />
        </div>

        {step === 1 ? (
          <StepInfo startLocked={hostLocked} workspaceId={workspaceId} />
        ) : null}
        {step === 2 ? (
          <StepConfig
            hostLocked={hostLocked}
            minigameOptions={minigameOptions}
            onPlatformChange={handlePlatformChange}
            platform={platform}
            platformChannels={platformChannels}
            viewUrl={viewUrl}
            workspaceId={workspaceId}
          />
        ) : null}
        {step === 3 ? (
          <StepReview minigameOptions={minigameOptions} viewUrl={viewUrl} />
        ) : null}

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t bg-background py-3">
          <div>
            {step === 1 ? (
              <Button
                onClick={() =>
                  router.push(`/space/${workspaceId}/leaderboards`)
                }
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
            ) : (
              <Button
                onClick={() => goToStep((step - 1) as Step)}
                type="button"
                variant="outline"
              >
                <ArrowLeftIcon className="rtl:rotate-180" />
                {step === 3
                  ? t("leaderboards.wizard.backToStep2")
                  : t("actions.back")}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {step < 3 ? (
              <Button
                onClick={() => goToStep((step + 1) as Step)}
                type="button"
              >
                {t("actions.continue")}
                <ArrowRightIcon className="rtl:rotate-180" />
              </Button>
            ) : (
              <>
                {isDraft ? (
                  <Button
                    disabled={isPending}
                    onClick={() => submit(false)}
                    type="button"
                    variant="outline"
                  >
                    {t("actions.saveAsDraft")}
                  </Button>
                ) : null}
                <Button
                  className={
                    isDraft
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : undefined
                  }
                  disabled={isPending}
                  onClick={() => submit(isDraft)}
                  type="button"
                >
                  {isPending ? <Loader2Icon className="animate-spin" /> : null}
                  {!isPending && isDraft ? <SendIcon /> : null}
                  {isDraft ? t("actions.publish") : t("actions.save")}
                </Button>
              </>
            )}
          </div>
        </div>
      </form>
    </Form>
  )
}
