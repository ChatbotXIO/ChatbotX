import {
  inboxService,
  messengerIntegrationService,
} from "@chatbotx.io/business"
import type { MessengerMessageTemplateModel } from "@chatbotx.io/database/types"
import type { MessengerTemplateParams } from "@chatbotx.io/flow-config"
import {
  contactVariableService,
  type ReplaceVariableProps,
} from "@chatbotx.io/variables"

export async function replaceMessengerTemplateVariables(props: {
  templateParams: MessengerTemplateParams
  variables: ReplaceVariableProps
  parameterFormat?: "POSITIONAL" | "NAMED"
}): Promise<MessengerTemplateParams> {
  const { variables, templateParams } = props
  const replacedParams = { ...templateParams }

  if (templateParams.header) {
    replacedParams.header = await Promise.all(
      templateParams.header.map(async (param) => {
        if (param.type === "text" && param.text) {
          return {
            ...param,
            text: await contactVariableService.replaceAll({
              variables,
              text: param.text,
            }),
          }
        }
        return param
      }),
    )
  }

  if (templateParams.body) {
    replacedParams.body = await Promise.all(
      templateParams.body.map(async (param) => ({
        ...param,
        text: await contactVariableService.replaceAll({
          text: param.text,
          variables,
        }),
      })),
    )
  }

  return replacedParams
}

type InboxWithIntegrationMessenger = NonNullable<
  Awaited<ReturnType<typeof inboxService.findWithIntegrationMessengerById>>
>

export type ValidatedMessengerTemplate = {
  // `integrationMessenger` is re-narrowed non-null here: `validateMessengerTemplate`
  // already guards `!inbox?.integrationMessenger` before returning, so every
  // caller of this type (e.g. `send-messenger-template.ts`'s ads-conversion
  // enqueue, Amendment A1) can read `validated.inbox.integrationMessenger.id`
  // without an extra null check.
  inbox: Omit<InboxWithIntegrationMessenger, "integrationMessenger"> & {
    integrationMessenger: NonNullable<
      InboxWithIntegrationMessenger["integrationMessenger"]
    >
  }
  template: MessengerMessageTemplateModel
}

// Accepts templateId string — returns fetched entities so caller avoids re-querying.
// Returns null on any validation failure (inbox not found, no integration, template not approved).
export async function validateMessengerTemplate(
  templateId: string,
  inboxId: string,
): Promise<ValidatedMessengerTemplate | null> {
  const inbox = await inboxService.findWithIntegrationMessengerById({
    id: inboxId,
  })

  if (!inbox?.integrationMessenger) {
    return null
  }

  const template =
    await messengerIntegrationService.findApprovedMessengerTemplate({
      id: templateId,
      integrationMessengerId: inbox.integrationMessenger.id,
    })

  if (!template) {
    return null
  }

  // Re-reads `inbox.integrationMessenger` (rather than spreading the bare
  // `inbox` variable) so TS's narrowing from the guard above actually
  // applies to the returned object's `integrationMessenger` field — a
  // narrowed property access doesn't propagate through the whole-object
  // reference otherwise.
  return {
    inbox: { ...inbox, integrationMessenger: inbox.integrationMessenger },
    template,
  }
}
