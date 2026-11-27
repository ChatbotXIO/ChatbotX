import {
  type SocialPostFeedTemplatesByProvider,
  socialProviders,
} from "@chatbotx.io/database/partials"
import { FeedTemplateError } from "@chatbotx.io/utils/feed-template"
import { renderFeedTemplate } from "./compose"
import type { FeedTemplateSource } from "./template-data"
import type { PostFeedPreviewProviderText } from "./types"

/**
 * What each network's own template renders for an item (a preview: the tabs of
 * the form). Networks without a template are not listed; a template that does
 * not render reports its problem instead of text. Order follows the provider enum.
 */
export const renderProviderTexts = (input: {
  image: string | null
  item: FeedTemplateSource
  templates: SocialPostFeedTemplatesByProvider
  timeZone: string
}): PostFeedPreviewProviderText[] => {
  const texts: PostFeedPreviewProviderText[] = []
  for (const provider of socialProviders.options) {
    const template = input.templates[provider]
    if (!template) {
      continue
    }
    try {
      texts.push({
        provider,
        templateProblem: null,
        text: renderFeedTemplate({
          image: input.image,
          item: input.item,
          syntax: "v2",
          template,
          timeZone: input.timeZone,
        }),
      })
    } catch (error) {
      if (!(error instanceof FeedTemplateError)) {
        throw error
      }
      texts.push({
        provider,
        templateProblem: {
          code: error.code,
          column: error.column,
          line: error.line,
          message: error.message,
        },
        text: "",
      })
    }
  }
  return texts
}
