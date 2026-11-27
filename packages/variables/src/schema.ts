import type { PipelineVariableTarget } from "@chatbotx.io/business/pipeline/variable-targets"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"

export type ContactCustomFieldValue = {
  key: string
  type: CustomFieldType
  value: string
  description: string
}

export type BotFieldValue = {
  type: CustomFieldType
  value: string | null
}

export type ContactVariableContext = {
  contact: ContactModel
  contactInbox: ContactInboxModel | null
  conversation?: ConversationModel | null
  appointmentId?: string
  /**
   * The inbox user who sent the running flow. Only set on a flow an inbox user
   * started; backs `{{admin_name}}` / `{{admin_team_name}}`.
   */
  sentByUserId?: string
  workspace: WorkspaceModel | null
}

export type PipelineItemsLoader = {
  get: () => Promise<PipelineVariableTarget[]>
  /** Id of the contact's most recently created or updated item, any pipeline. */
  lastItemId: () => Promise<string | null>
}

/**
 * What identifies the comment a post-comment trigger run is about. Small ids
 * only, so it rides in a flow run's metadata and survives a Wait.
 */
export type PostCommentVariableRef = {
  channelPostId: string
  commentMessageCreatedAt: string
  commentMessageId: string
}

/** What `{{post.*}}` and `{{comment.*}}` render, loaded once per variables context. */
export type PostCommentVariableValues = {
  commentId: string
  commentText: string
  postId: string
  postLink: string
  postPageName: string
  postPublishedAt: Date | null
  postText: string
}

export type PostCommentLoader = {
  get: () => Promise<PostCommentVariableValues | null>
}

export type ReplaceVariableProps = ContactVariableContext & {
  customFieldsMap: Map<string, ContactCustomFieldValue>
  /**
   * Workspace-level Account Fields (Bot Fields), keyed by id — matches the
   * `bot_field:<id>` reference token (see `@chatbotx.io/flow-config`'s
   * `parseFieldReference`). Optional so the many test fixtures and call
   * sites built before Account Fields existed keep type-checking; a missing
   * map simply means no `bot_field:` tokens resolve, same as an empty one.
   * `contactVariableService.getAll` always populates it in production.
   */
  botFieldsMap?: Map<string, BotFieldValue>
  /**
   * The contact's pipeline items: the latest open (else latest) item per
   * pipeline for `{{pipelines.<ref>.<attr>}}`, and the last touched item for
   * `{{last_opportunity_id}}`. Lazy and memoized per read: a query starts on
   * its first call and is shared by every later one, so a render that never
   * reads a pipeline variable never queries (or leaves a rejected, unawaited
   * promise behind). `contactVariableService.getAll` adds it.
   */
  pipelineItems?: PipelineItemsLoader
  /**
   * The comment a post-comment trigger run is about, for `{{post.*}}` and
   * `{{comment.*}}`. Set only by a run that has one: elsewhere those tokens
   * render empty. Lazy and memoized like `pipelineItems`.
   */
  postComment?: PostCommentLoader
}
