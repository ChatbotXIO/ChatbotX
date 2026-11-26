import { messageService } from "@chatbotx.io/business"
import type {
  ContactInboxModel,
  ConversationModel,
  UserModel,
} from "@chatbotx.io/database/types"
import type { EditedTranslation } from "./create-translated-outgoing"

type CreateOutgoingArgs = Parameters<typeof messageService.createOutgoing>[0]

/**
 * The one place an Inbox/API send decides whether translation is involved.
 * Without `translate: true` it is `messageService.createOutgoing` untouched, so
 * every existing caller and response is unchanged; with it, the send goes
 * through {@link createOutgoingWithTranslation} and the response carries
 * `translation`, `translationFallback` and `editedTranslationDiscarded`.
 */
export async function sendOutgoing<
  TInput extends {
    translate?: boolean
    editedTranslation?: EditedTranslation
  },
>(props: {
  workspaceId: string
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  input: TInput
  user?: Pick<UserModel, "id">
  sendFrom: CreateOutgoingArgs["sendFrom"]
}) {
  const { translate, editedTranslation, ...input } = props.input
  const base = {
    conversation: props.conversation,
    contactInbox: props.contactInbox,
    // Omitted, not `undefined`: a workspace-token send has no user.
    ...(props.user && { user: props.user }),
    sendFrom: props.sendFrom,
  }
  if (translate !== true) {
    return await messageService.createOutgoing({ ...base, input })
  }

  // Loaded only when asked for: most sends never translate, and this pulls in
  // the AI provider SDKs.
  const { createOutgoingWithTranslation } = await import(
    "./create-translated-outgoing"
  )
  const result = await createOutgoingWithTranslation({
    ...base,
    workspaceId: props.workspaceId,
    input,
    editedTranslation,
  })
  return result.message
    ? {
        ...result.message,
        translation: result.translation,
        translationFallback: result.translationFallback,
        editedTranslationDiscarded: result.editedTranslationDiscarded,
      }
    : result.message
}
