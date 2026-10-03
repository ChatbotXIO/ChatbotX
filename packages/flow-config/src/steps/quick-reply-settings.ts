import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { addMilliseconds } from "date-fns"
import { z } from "zod"
import { flowValidationCodes } from "../validation-codes"
import { type ButtonType, buttonTypes } from "./button"
import { FOLLOW_UP_MAX_DELAY_DAYS } from "./follow-up"
import { startAnotherNodeStepSchema } from "./start-another-node"
import { startExternalFlowStepSchema } from "./start-external-flow"
import { startExternalNodeStepSchema } from "./start-external-node"
import { stepTypes } from "./step-action"
import { delayUnitToMs, waitStepDelayUnits } from "./wait"

export const quickReplySettingsDelayUnits = waitStepDelayUnits.extract([
  "minutes",
  "hours",
  "days",
])
export type QuickReplySettingsDelayUnit = z.infer<
  typeof quickReplySettingsDelayUnits
>

export const QUICK_REPLY_MAX_RETRIES = 5
export const QUICK_REPLY_DEFAULT_RETRIES = 3
export const QUICK_REPLY_RETRY_MESSAGE_MAX = 255
const FOLLOW_UP_MAX_DELAY_MS = FOLLOW_UP_MAX_DELAY_DAYS * 86_400_000

/** Open Website needs a click and an option list is WhatsApp-only UI. */
export const quickReplyNextStepHiddenButtonTypes: ButtonType[] = [
  buttonTypes.enum.openWebsite,
  buttonTypes.enum.whatsappOptionList,
]

/**
 * A label-less, steps-less button. The handle id lives on the owning section
 * (`followUp.id` / `retry.id`) so an edge can be dropped and re-drawn without
 * the handle disappearing.
 */
export const quickReplyNextStepSchema = z.discriminatedUnion("buttonType", [
  z.object({
    buttonType: z.literal(buttonTypes.enum.sendMessage),
    beforeStep: startAnotherNodeStepSchema,
  }),
  z.object({
    buttonType: z.literal(buttonTypes.enum.performAction),
    beforeStep: startAnotherNodeStepSchema,
  }),
  z.object({
    buttonType: z.literal(buttonTypes.enum.startAnotherNode),
    beforeStep: startAnotherNodeStepSchema,
  }),
  z.object({
    buttonType: z.literal(buttonTypes.enum.startExternalFlow),
    beforeStep: startExternalFlowStepSchema,
  }),
  z.object({
    buttonType: z.literal(buttonTypes.enum.startExternalNode),
    beforeStep: startExternalNodeStepSchema,
  }),
])
export type QuickReplyNextStep = z.infer<typeof quickReplyNextStepSchema>

export const quickReplyFollowUpSettingsSchema = z.object({
  id: zodBigintAsString(),
  enabled: z.boolean(),
  duration: z.coerce.number().int().min(1),
  unit: quickReplySettingsDelayUnits,
  target: quickReplyNextStepSchema.nullable(),
})
export type QuickReplyFollowUpSettings = z.infer<
  typeof quickReplyFollowUpSettingsSchema
>

export const quickReplyRetrySettingsSchema = z.object({
  id: zodBigintAsString(),
  enabled: z.boolean(),
  message: z.string().trim().max(QUICK_REPLY_RETRY_MESSAGE_MAX),
  maxRetries: z.coerce.number().int().min(0).max(QUICK_REPLY_MAX_RETRIES),
  target: quickReplyNextStepSchema.nullable(),
})
export type QuickReplyRetrySettings = z.infer<
  typeof quickReplyRetrySettingsSchema
>

export const quickReplySettingsSchema = z.object({
  followUp: quickReplyFollowUpSettingsSchema,
  retry: quickReplyRetrySettingsSchema,
})
export type QuickReplySettings = z.infer<typeof quickReplySettingsSchema>

export const quickReplySettingsDefaultFn = (): QuickReplySettings => ({
  followUp: {
    id: createId(),
    enabled: false,
    duration: 1,
    unit: quickReplySettingsDelayUnits.enum.days,
    target: null,
  },
  retry: {
    id: createId(),
    enabled: false,
    message: "",
    maxRetries: QUICK_REPLY_DEFAULT_RETRIES,
    target: null,
  },
})

type SettingsBearingDetails = {
  steps?: readonly { stepType?: unknown }[]
  quickReplies?: readonly unknown[]
  quickReplySettings?: QuickReplySettings | null
}

const asSettingsDetails = (details: unknown): SettingsBearingDetails | null =>
  details && typeof details === "object"
    ? (details as SettingsBearingDetails)
    : null

const hasGetUserDataStep = (details: SettingsBearingDetails) =>
  (details.steps ?? []).some(
    (step) => step?.stepType === stepTypes.enum.getUserData,
  )

/** Node-level rules: they need `steps` and `quickReplies` as well. */
export const refineQuickReplySettings = (
  details: SettingsBearingDetails,
  ctx: z.RefinementCtx,
): void => {
  const settings = details.quickReplySettings
  if (!settings || (details.quickReplies ?? []).length === 0) {
    return
  }

  const { followUp, retry } = settings
  if (followUp.enabled) {
    if (!followUp.target) {
      ctx.addIssue({
        code: "custom",
        path: ["quickReplySettings", "followUp", "target"],
        message: flowValidationCodes.quickReplyNextStepRequired,
      })
    }
    if (
      Number(followUp.duration) * delayUnitToMs(followUp.unit) >
      FOLLOW_UP_MAX_DELAY_MS
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["quickReplySettings", "followUp", "duration"],
        message: `Follow-up delay cannot exceed ${FOLLOW_UP_MAX_DELAY_DAYS} days`,
      })
    }
  }

  if (retry.enabled) {
    if (!retry.target) {
      ctx.addIssue({
        code: "custom",
        path: ["quickReplySettings", "retry", "target"],
        message: flowValidationCodes.quickReplyNextStepRequired,
      })
    }
    if (Number(retry.maxRetries) >= 1 && retry.message.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["quickReplySettings", "retry", "message"],
        message: flowValidationCodes.quickReplyRetryMessageRequired,
      })
    }
    if (hasGetUserDataStep(details)) {
      ctx.addIssue({
        code: "custom",
        path: ["quickReplySettings", "retry", "enabled"],
        message: flowValidationCodes.quickReplyRetryWithGetUserData,
      })
    }
  }
}

export type ActiveQuickReplySettings = {
  followUp?: QuickReplyFollowUpSettings & { target: QuickReplyNextStep }
  retry?: QuickReplyRetrySettings & { target: QuickReplyNextStep }
}

/**
 * The sections the worker should act on. Node JSON reaches the worker
 * unparsed, so this tolerates legacy nodes and string-typed numbers.
 */
export const resolveActiveQuickReplySettings = (
  rawDetails: unknown,
): ActiveQuickReplySettings => {
  const details = asSettingsDetails(rawDetails)
  const settings = details?.quickReplySettings
  if (!(details && settings) || (details.quickReplies ?? []).length === 0) {
    return {}
  }

  const active: ActiveQuickReplySettings = {}
  if (settings.followUp?.enabled && settings.followUp.target) {
    active.followUp = {
      ...settings.followUp,
      duration: Number(settings.followUp.duration),
      target: settings.followUp.target,
    }
  }
  if (
    settings.retry?.enabled &&
    settings.retry.target &&
    !hasGetUserDataStep(details)
  ) {
    active.retry = {
      ...settings.retry,
      maxRetries: Number(settings.retry.maxRetries),
      target: settings.retry.target,
    }
  }
  return active
}

export const quickReplyNextStepFollowsEdge = (
  target: QuickReplyNextStep | null,
): boolean =>
  target === null ||
  target.buttonType === buttonTypes.enum.sendMessage ||
  target.buttonType === buttonTypes.enum.performAction ||
  target.buttonType === buttonTypes.enum.startAnotherNode

/** Source handles the canvas renders under the quick replies. */
export const listQuickReplySettingsHandles = (
  rawDetails: unknown,
): Array<{ kind: "followUp" | "retry"; id: string }> => {
  const details = asSettingsDetails(rawDetails)
  const settings = details?.quickReplySettings
  if (!(details && settings) || (details.quickReplies ?? []).length === 0) {
    return []
  }

  const handles: Array<{ kind: "followUp" | "retry"; id: string }> = []
  // `?.`: an unvalidated draft or API write can carry a partial object, and
  // this runs on every canvas render.
  if (
    settings.followUp?.enabled &&
    quickReplyNextStepFollowsEdge(settings.followUp.target)
  ) {
    handles.push({ kind: "followUp", id: settings.followUp.id })
  }
  if (
    settings.retry?.enabled &&
    !hasGetUserDataStep(details) &&
    quickReplyNextStepFollowsEdge(settings.retry.target)
  ) {
    handles.push({ kind: "retry", id: settings.retry.id })
  }
  return handles
}

export const computeQuickReplyFollowUpTriggerAt = (
  settings: Pick<QuickReplyFollowUpSettings, "duration" | "unit">,
): Date =>
  addMilliseconds(
    Date.now(),
    Number(settings.duration) * delayUnitToMs(settings.unit),
  )
