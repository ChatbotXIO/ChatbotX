import {
  type BroadcastFlowType,
  type BroadcastScheduleType,
  type BroadcastSubaction,
  broadcastFlowTypes,
  broadcastScheduleTypes,
  broadcastSubactions,
  type ChannelType,
  channelTypes,
} from "@chatbotx.io/database/partials"
import type { BroadcastModel } from "@chatbotx.io/database/types"
import { z } from "zod"
import {
  type ContactFilterCriteria,
  contactFilterCriteriaSchema,
} from "@/features/contact-filter/schema"
import {
  broadcastTemplateButtonsSchema,
  broadcastTemplateDataSchema,
} from "../schema/action"

type BroadcastTemplateData = z.infer<typeof broadcastTemplateDataSchema>
type BroadcastTemplateButtons = z.infer<typeof broadcastTemplateButtonsSchema>

const EMPTY_CONTACT_FILTER: ContactFilterCriteria = {
  operator: "and",
  conditions: [],
}

export type CreateBroadcastDefaultValues = {
  channel: ChannelType | undefined
  flowId: undefined
  subaction: BroadcastSubaction | undefined
  integrationWhatsappId: string | undefined
  schedulesType: "now"
  schedulesAt: null
  contactFilter: ContactFilterCriteria
}

/**
 * Seeds `CreateBroadcastForm`'s `defaultValues` from an optional deep-link
 * prefill (Ads Analytics' per-ad "Retarget → Send WhatsApp broadcast →
 * {segment}"). WhatsApp needs a template subaction — the audience can be
 * older than the 24h session window — so a prefilled WhatsApp channel always
 * defaults to `whatsappTemplateMessage`. When `initialChannel` is set, the
 * channel-picker step is skipped because `watchedChannel` is already
 * non-empty.
 */
export function buildCreateBroadcastDefaultValues(input: {
  initialChannel?: ChannelType
  initialIntegrationWhatsappId?: string
  initialContactFilter?: ContactFilterCriteria
}): CreateBroadcastDefaultValues {
  return {
    channel: input.initialChannel,
    flowId: undefined,
    subaction:
      input.initialChannel === channelTypes.enum.whatsapp
        ? broadcastSubactions.enum.whatsappTemplateMessage
        : undefined,
    integrationWhatsappId: input.initialIntegrationWhatsappId,
    schedulesType: "now",
    schedulesAt: null,
    contactFilter: input.initialContactFilter ?? EMPTY_CONTACT_FILTER,
  }
}

/**
 * The stored draft columns the edit form needs. Narrower than `BroadcastModel`
 * on purpose: nothing else on the row can influence the prefill.
 */
export type EditableBroadcastDraft = Pick<
  BroadcastModel,
  | "id"
  | "channel"
  | "subaction"
  | "flowId"
  | "templateId"
  | "integrationWhatsappId"
  | "integrationMessengerId"
  | "templateData"
  | "schedulesType"
  | "schedulesAt"
  | "contactFilter"
>

export type EditBroadcastDefaultValues = {
  channel: ChannelType
  subaction: BroadcastSubaction
  /** Form-only field driving the flow-vs-template selector. */
  templateType: BroadcastFlowType
  flowId: string | undefined
  templateId: string | undefined
  integrationWhatsappId: string | undefined
  integrationMessengerId: string | undefined
  templateData: BroadcastTemplateData | undefined
  buttons: BroadcastTemplateButtons
  schedulesType: BroadcastScheduleType
  schedulesAt: string | null
  contactFilter: ContactFilterCriteria
  saveAsDraft: false
}

export type EditBroadcastDraft = {
  id: string
  channel: ChannelType
  defaultValues: EditBroadcastDefaultValues
}

const storedJsonObject = z.record(z.string(), z.unknown())

/** Only a `future` draft keeps its stored time; `now` is resolved at submit. */
const resolveSchedulesAt = (
  draft: EditableBroadcastDraft,
  schedulesType: BroadcastScheduleType,
): string | null =>
  schedulesType === broadcastScheduleTypes.enum.future
    ? draft.schedulesAt.toISOString()
    : null

/**
 * Splits the flow-button bindings back out of the merged `templateData` jsonb
 * (`createBroadcastAction` stores them as one object) so both halves land on
 * the form fields that own them.
 */
const splitTemplateData = (
  stored: unknown,
): {
  templateData: BroadcastTemplateData | undefined
  buttons: BroadcastTemplateButtons
} => {
  const record = storedJsonObject.safeParse(stored)
  if (!record.success) {
    return { templateData: undefined, buttons: [] }
  }

  const { buttons, ...templateData } = record.data
  const parsedButtons = broadcastTemplateButtonsSchema.safeParse(buttons)
  const parsedTemplateData = broadcastTemplateDataSchema.safeParse(templateData)

  return {
    templateData: parsedTemplateData.success
      ? parsedTemplateData.data
      : undefined,
    buttons: parsedButtons.success ? parsedButtons.data : [],
  }
}

/**
 * Seeds `CreateBroadcastForm`'s `defaultValues` from an existing draft so the
 * same form can edit it. Returns `null` when the stored channel or subaction is
 * no longer a value the app knows — the page 404s rather than rendering a form
 * whose channel-specific steps cannot be resolved.
 */
export function buildEditBroadcastDefaultValues(
  draft: EditableBroadcastDraft,
): EditBroadcastDraft | null {
  const channel = channelTypes.safeParse(draft.channel)
  const subaction = broadcastSubactions.safeParse(draft.subaction)
  if (!(channel.success && subaction.success)) {
    return null
  }

  const schedulesType = broadcastScheduleTypes.safeParse(draft.schedulesType)
  const resolvedSchedulesType = schedulesType.success
    ? schedulesType.data
    : broadcastScheduleTypes.enum.now
  const contactFilter = contactFilterCriteriaSchema.safeParse(
    draft.contactFilter,
  )
  const { templateData, buttons } = splitTemplateData(draft.templateData)

  return {
    id: draft.id,
    channel: channel.data,
    defaultValues: {
      channel: channel.data,
      subaction: subaction.data,
      templateType: draft.templateId
        ? broadcastFlowTypes.enum.template
        : broadcastFlowTypes.enum.flow,
      flowId: draft.flowId ?? undefined,
      templateId: draft.templateId ?? undefined,
      integrationWhatsappId: draft.integrationWhatsappId ?? undefined,
      integrationMessengerId: draft.integrationMessengerId ?? undefined,
      templateData,
      buttons,
      schedulesType: resolvedSchedulesType,
      schedulesAt: resolveSchedulesAt(draft, resolvedSchedulesType),
      contactFilter: contactFilter.success
        ? contactFilter.data
        : EMPTY_CONTACT_FILTER,
      saveAsDraft: false,
    },
  }
}
