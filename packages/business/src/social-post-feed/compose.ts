import type {
  SocialPostFeedTemplatesByProvider,
  SocialProvider,
} from "@chatbotx.io/database/partials"
import {
  FeedTemplateError,
  renderTemplate,
} from "@chatbotx.io/utils/feed-template"
import { logger } from "../logger"
import { composeSignedText } from "../social-post-snippet/service"
import { POST_FEED_POST_TEXT_MAX } from "./limits"
import { type FeedTemplateSource, feedTemplateData } from "./template-data"
import { renderFeedText, truncateText } from "./text"
import {
  registeredFeedAiModelChecker,
  registeredFeedPostWriter,
} from "./writer"

/** Why a post was written from the template although the feed asks for AI. */
export const FEED_AI_FALLBACK_NOTE = "aiFallback"
/** The template could not be rendered for this item. */
export const FEED_TEMPLATE_FAILED_CODE = "templateError"

export type FeedTemplateSyntaxName = "legacy" | "v2"

export type ComposeFeedFeed = {
  aiInstructions: string | null
  aiIntegrationId: string | null
  aiModel: string | null
  aiWrite: boolean
  id: string
  templateSyntax: FeedTemplateSyntaxName
  /** Text per network (`v2` only); a network without one uses `textTemplate`. */
  templatesByProvider?: SocialPostFeedTemplatesByProvider
  textTemplate: string
  workspaceId: string
}

export type ComposeFeedItem = FeedTemplateSource & { itemKey: string }

export type ComposedFeedText = {
  /** Set to {@link FEED_AI_FALLBACK_NOTE} when AI was asked for and the template was used. */
  note: string | null
  /**
   * The text of a network whose own template renders differently from the shared
   * text (signature included; may be empty). Never set when AI wrote the post:
   * an AI text is ONE shared text for every network.
   */
  providerTexts: Partial<Record<SocialProvider, string>>
  /** The rendered text, signature included. */
  text: string
}

/**
 * The template filled in with an item, as plain text. A `legacy` template is
 * read the way it always was (`{title}`); a `v2` one goes through the template
 * language. The v2 result is NOT cut to a length: the platform's own rules
 * decide whether it fits, and a post that does not fit is recorded, never
 * silently shortened. Throws {@link FeedTemplateError} for a v2 template that
 * cannot be rendered.
 */
export const renderFeedTemplate = (input: {
  image?: string | null
  item: FeedTemplateSource
  syntax: FeedTemplateSyntaxName
  template: string
  timeZone: string
}): string =>
  input.syntax === "legacy"
    ? renderFeedText(input.template, input.item)
    : renderTemplate(
        input.template,
        feedTemplateData(input.item, input.image ?? input.item.image),
        { timeZone: input.timeZone },
      )

/** The model's text always carries the item's link: it is the point of the post. */
const withLink = (text: string, link: string | null): string =>
  link && !text.includes(link) ? `${text}\n${link}` : text

/**
 * The text of the post an item becomes: the feed's template, or, when the feed
 * asks for it, ONE shared AI text that takes the rendered template as its brief.
 * Never throws for an AI problem (no writer, a provider failure, a rate limit,
 * empty output): the rendered template is used and the note says so. A template
 * error propagates ({@link FeedTemplateError}) so the item is recorded.
 */
export const composeFeedText = async (input: {
  destinationIds: string[]
  feed: ComposeFeedFeed
  image?: string | null
  item: ComposeFeedItem
  /** The networks of the destinations the post goes to (each provider template is rendered once). */
  providers?: readonly SocialProvider[]
  signature: string | null
  /** Distinguishes a test send from the item's real post. */
  purpose: "post" | "test"
  timeZone: string
}): Promise<ComposedFeedText> => {
  const { feed, item } = input
  const rendered = renderFeedTemplate({
    image: input.image,
    item,
    syntax: feed.templateSyntax,
    template: feed.textTemplate,
    timeZone: input.timeZone,
  })
  let note: string | null = null
  let text: string | null = null
  if (feed.aiWrite) {
    const write = registeredFeedPostWriter()
    try {
      if (!write) {
        throw new Error("No feed post writer is registered")
      }
      // A stale or foreign integration id is never used: it must resolve inside this workspace.
      if (feed.aiIntegrationId && feed.aiModel) {
        const usable = await registeredFeedAiModelChecker()?.({
          integrationId: feed.aiIntegrationId,
          model: feed.aiModel,
          workspaceId: feed.workspaceId,
        })
        if (!usable) {
          throw new Error("The feed's AI integration is not usable here")
        }
      }
      const written = await write({
        actorId: feed.id,
        brief: rendered || null,
        destinationIds: input.destinationIds,
        idempotencyKey: `feed-${input.purpose}:${feed.id}:${item.itemKey}`,
        instructions: feed.aiInstructions,
        integrationId: feed.aiIntegrationId,
        item: { link: item.link, summary: item.summary, title: item.title },
        model: feed.aiModel,
        workspaceId: feed.workspaceId,
      })
      text = truncateText(
        withLink(written.trim(), item.link),
        POST_FEED_POST_TEXT_MAX,
      )
    } catch (err) {
      if (err instanceof FeedTemplateError) {
        throw err
      }
      logger.warn(
        { err, feedId: feed.id },
        "social-post feed: AI writing failed, the template is used",
      )
      note = FEED_AI_FALLBACK_NOTE
    }
  }
  const body = text || rendered
  const sign = (value: string): string =>
    input.signature && value ? composeSignedText(value, input.signature) : value
  const shared = sign(body)
  const providerTexts: Partial<Record<SocialProvider, string>> = {}
  if (!text && feed.templateSyntax === "v2" && feed.templatesByProvider) {
    for (const provider of new Set(input.providers ?? [])) {
      const template = feed.templatesByProvider[provider]
      if (!template) {
        continue
      }
      const own = sign(
        renderFeedTemplate({
          image: input.image,
          item,
          syntax: "v2",
          template,
          timeZone: input.timeZone,
        }),
      )
      if (own !== shared) {
        providerTexts[provider] = own
      }
    }
  }
  return { note, providerTexts, text: shared }
}
