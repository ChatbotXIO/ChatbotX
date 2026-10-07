import { resolveBroadcastTemplateParams } from "@chatbotx.io/business"
import { validationException } from "@chatbotx.io/business/errors"
import type { CreateBroadcastRequest } from "../schema/action"
import type { CreateBroadcastPublicRequest } from "../schema/public"

/**
 * Turns the public request's flat `templateParams` (top level and per target)
 * into the nested `templateData` the broadcast service stores, so the API and
 * the builder hand the service the same payload.
 */
export async function resolvePublicBroadcastTemplateParams(input: {
  workspaceId: string
  request: CreateBroadcastPublicRequest
}): Promise<CreateBroadcastRequest> {
  const { templateParams, targets, ...rest } = input.request
  const resolve = async (props: {
    templateId: string | undefined
    values: Record<string, string>
    field: string
  }) => {
    if (!props.templateId) {
      throw validationException(
        props.field,
        "templateParams needs a templateId",
      )
    }
    return await resolveBroadcastTemplateParams({
      workspaceId: input.workspaceId,
      channel: rest.channel,
      templateId: props.templateId,
      values: props.values,
      field: props.field,
    })
  }

  const templateData = templateParams
    ? await resolve({
        templateId: rest.templateId,
        values: templateParams,
        field: "templateParams",
      })
    : rest.templateData

  const resolvedTargets = targets
    ? await Promise.all(
        targets.map(
          async ({ templateParams: targetParams, ...target }, index) => ({
            ...target,
            templateData: targetParams
              ? await resolve({
                  templateId: target.templateId,
                  values: targetParams,
                  field: `targets.${index}.templateParams`,
                })
              : target.templateData,
          }),
        ),
      )
    : undefined

  return { ...rest, templateData, targets: resolvedTargets }
}
