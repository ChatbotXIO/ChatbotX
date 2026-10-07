import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  type AppliedTemplateParameters,
  applyMessengerTemplateParameterValues,
  applyWaTemplateParameterValues,
  describeMessengerTemplateParameters,
  describeWaTemplateParameters,
  type MessengerTemplateComponent,
  type MessengerTemplateParams,
  type TemplateComponent,
  type TemplateParameterSpec,
  type TemplateParameterValues,
  validateWaTemplateSendParams,
  type WaTemplateParams,
  waTemplateParamsSchema,
} from "@chatbotx.io/flow-config"
import { notFoundException, validationException } from "../errors"
import { messengerMessageTemplateService } from "../messenger-message-template/service"
import { whatsappMessageTemplateService } from "../whatsapp-message-template/service"

export type BroadcastTemplateParams = WaTemplateParams | MessengerTemplateParams

type MessengerParameterFormat = Parameters<
  typeof applyMessengerTemplateParameterValues
>[1]

// The same send-blocking rules (MPM sections, LTO expiry) the broadcast
// create schema runs on a caller-built `templateData`.
const waSendParamsSchema = waTemplateParamsSchema.superRefine((params, ctx) =>
  validateWaTemplateSendParams(params, ctx),
)

const describeProblems = (
  applied: AppliedTemplateParameters<BroadcastTemplateParams>,
): string[] =>
  [
    applied.missing.length > 0 && `missing: ${applied.missing.join(", ")}`,
    applied.unknown.length > 0 && `unknown: ${applied.unknown.join(", ")}`,
    applied.invalid.length > 0 && `invalid: ${applied.invalid.join(", ")}`,
    applied.unsupported.length > 0 &&
      `send templateData for: ${applied.unsupported.join(", ")}`,
  ].filter((problem): problem is string => typeof problem === "string")

async function applyForChannel(input: {
  workspaceId: string
  channel: ChannelType
  templateId: string
  values: TemplateParameterValues
}): Promise<AppliedTemplateParameters<BroadcastTemplateParams>> {
  if (input.channel === "whatsapp") {
    const template = await whatsappMessageTemplateService.findByIdForWorkspace({
      id: input.templateId,
      workspaceId: input.workspaceId,
    })
    if (!template) {
      throw notFoundException("Template not found")
    }
    return applyWaTemplateParameterValues(
      template.components as TemplateComponent[],
      input.values,
    )
  }
  if (input.channel === "messenger") {
    const template = await messengerMessageTemplateService.findByIdForWorkspace(
      { id: input.templateId, workspaceId: input.workspaceId },
    )
    if (!template) {
      throw notFoundException("Template not found")
    }
    return applyMessengerTemplateParameterValues(
      template.components as MessengerTemplateComponent[],
      template.parameterFormat as MessengerParameterFormat,
      input.values,
    )
  }
  throw validationException(
    "channel",
    `Templates are only sent on whatsapp and messenger, not ${input.channel}`,
  )
}

/**
 * Turns a caller's flat `{ key: value }` template parameters into the nested
 * params a broadcast stores, for a template of the caller's workspace. Any
 * missing, unknown or invalid key is a 422 naming the keys, so the caller can
 * fix the request without reading Meta's component format.
 */
export async function resolveBroadcastTemplateParams(input: {
  workspaceId: string
  channel: ChannelType
  templateId: string
  values: TemplateParameterValues
  /** Request path of the values, for the error, e.g. `targets.0.templateParams`. */
  field: string
}): Promise<BroadcastTemplateParams> {
  const applied = await applyForChannel(input)
  const problems = describeProblems(applied)
  if (problems.length > 0) {
    throw validationException(
      input.field,
      `Template parameters do not match the template (${problems.join("; ")})`,
    )
  }
  if (input.channel === "whatsapp") {
    const checked = waSendParamsSchema.safeParse(applied.params)
    if (!checked.success) {
      throw validationException(
        input.field,
        checked.error.issues.map((issue) => issue.message).join("; "),
      )
    }
  }
  return applied.params
}

/** The flat keys a caller fills for a template, by channel. */
export function describeTemplateParameters(
  input:
    | { channel: "whatsapp"; components: unknown }
    | { channel: "messenger"; components: unknown },
): TemplateParameterSpec[] {
  return input.channel === "whatsapp"
    ? describeWaTemplateParameters(input.components as TemplateComponent[])
    : describeMessengerTemplateParameters(
        input.components as MessengerTemplateComponent[],
      )
}
