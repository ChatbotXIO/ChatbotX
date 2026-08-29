import { db } from "@chatbotx.io/database/client"
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

// `typeof db.query.inboxModel.findFirst` alone (no call) resolves to the
// no-`with` overload, which drops `integrationMessenger` from the inferred
// return type — wrapping the actual call (with its `with` config) in a
// function lets `ReturnType` capture the relation instead.
function queryInboxWithIntegrationMessenger(inboxId: string) {
  return db.query.inboxModel.findFirst({
    where: { id: inboxId },
    with: { integrationMessenger: true },
  })
}

type InboxWithIntegrationMessenger = NonNullable<
  Awaited<ReturnType<typeof queryInboxWithIntegrationMessenger>>
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
  template: NonNullable<
    Awaited<ReturnType<typeof db.query.messengerMessageTemplateModel.findFirst>>
  >
}

// Accepts templateId string — returns fetched entities so caller avoids re-querying.
// Returns null on any validation failure (inbox not found, no integration, template not approved).
export async function validateMessengerTemplate(
  templateId: string,
  inboxId: string,
): Promise<ValidatedMessengerTemplate | null> {
  const inbox = await queryInboxWithIntegrationMessenger(inboxId)

  if (!inbox?.integrationMessenger) {
    return null
  }

  const template = await db.query.messengerMessageTemplateModel.findFirst({
    where: {
      id: templateId,
      integrationMessengerId: inbox.integrationMessenger.id,
      status: "APPROVED",
    },
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
