/**
 * Writing a feed item's post with AI needs the model client of
 * `@chatbotx.io/ai`, which depends on this package, so the writer is injected:
 * the worker and the builder's Node route handlers register it at start-up
 * (`@chatbotx.io/ai/feed-post-writer`). A process that registered none writes
 * every post from the feed's text template.
 */

/** What the writer receives about one item; all of it is untrusted text. */
export type FeedWriterItem = {
  link: string | null
  summary: string | null
  title: string | null
}

export type FeedWriterInput = {
  /**
   * The feed's template filled in with the item (plain text): the draft the model
   * improves. Null when the template could not be rendered.
   */
  brief: string | null
  destinationIds: string[]
  /** Stable per feed and item; a repeat of the same call is replayed, not paid twice. */
  idempotencyKey: string
  /** The owner's extra wording; untrusted. */
  instructions: string | null
  /** The feed's own model choice; both or neither (then the Inbox translation model is used). */
  integrationId: string | null
  item: FeedWriterItem
  model: string | null
  /** One call at a time per actor; the feed id. */
  actorId: string
  workspaceId: string
}

/** Returns the post text. Throws when the model cannot write it. */
export type FeedPostWriter = (input: FeedWriterInput) => Promise<string>

let registered: FeedPostWriter | null = null

export const registerFeedPostWriter = (writer: FeedPostWriter): void => {
  registered = writer
}

export const registeredFeedPostWriter = (): FeedPostWriter | null => registered

export type FeedAiModelChecker = (input: {
  integrationId: string
  model: string
  workspaceId: string
}) => Promise<boolean>

let registeredChecker: FeedAiModelChecker | null = null

export const registerFeedAiModelChecker = (
  checker: FeedAiModelChecker,
): void => {
  registeredChecker = checker
}

export const registeredFeedAiModelChecker = (): FeedAiModelChecker | null =>
  registeredChecker
