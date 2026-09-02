import type { z } from "zod"
import type {
  SendWaTemplateMessageStepSchema,
  WaTemplateParams,
} from "./send-wa-message-template"
import { validateLimitedTimeOfferParams } from "./wa-template-limited-time-offer"
import { validateMpmParams } from "./wa-template-mpm-rules"

/**
 * Single entry point for every send-blocking WhatsApp template param rule, so
 * the flow publish validator and the broadcast create schema can never drift.
 * Add future param rules here, not at the call sites.
 */
export function validateWaTemplateSendParams(
  params: WaTemplateParams,
  ctx: z.RefinementCtx,
  basePath: (string | number)[] = [],
): void {
  validateMpmParams(params, ctx, basePath)
  validateLimitedTimeOfferParams(params, ctx, basePath)
}

/**
 * Step-level refinement so a channel validator can attach the combined rules
 * to `sendWaTemplateMessageStepSchema`, mirroring `refineWhatsappCarouselStep`.
 */
export const refineWaTemplateSendStep = (
  step: SendWaTemplateMessageStepSchema,
  ctx: z.RefinementCtx,
): void =>
  validateWaTemplateSendParams(step.template.params, ctx, [
    "template",
    "params",
  ])
