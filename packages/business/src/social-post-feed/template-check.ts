import {
  type SocialPostFeedTemplateSyntax,
  type SocialPostFeedTemplatesByProvider,
  socialPostFeedTemplatesByProvider,
} from "@chatbotx.io/database/partials"
import {
  checkTemplate,
  looksLikeLegacyTemplate,
} from "@chatbotx.io/utils/feed-template"
import { ChatbotXException, validationException } from "../errors"

const TEMPLATE_INVALID_CODE = "templateInvalid"

/** A v2 template that does not parse: 422 with the place of the problem in `data`. */
export const assertTemplate = (field: string, template: string): void => {
  const check = checkTemplate(template)
  if (!check.ok) {
    const exception = new ChatbotXException(
      `${check.message} (line ${check.line}, column ${check.column})`,
      TEMPLATE_INVALID_CODE,
      422,
    )
    exception.data = {
      code: check.code,
      column: check.column,
      field,
      line: check.line,
    }
    throw exception
  }
}

/**
 * The shape of per-network templates: keys are the provider enum (nothing
 * else), each text is 1 to 5000 characters, and a feed that reads its text as
 * `legacy` has none (it would publish `{{ }}` tags literally). A preview checks
 * only this and reports a template's own problem in its result.
 */
export const assertProviderTemplateShape = (
  syntax: SocialPostFeedTemplateSyntax,
  templates: SocialPostFeedTemplatesByProvider,
): SocialPostFeedTemplatesByProvider => {
  const parsed = socialPostFeedTemplatesByProvider.safeParse(templates)
  if (!parsed.success) {
    throw validationException(
      "templatesByProvider",
      "Give a template per network (facebook, instagram, threads, tiktok), each 1 to 5000 characters.",
    )
  }
  if (syntax === "legacy" && Object.keys(parsed.data).length > 0) {
    throw validationException(
      "templatesByProvider",
      "Text per network needs templateSyntax v2; convert the shared template first.",
    )
  }
  return parsed.data
}

/** The per-network templates as they will be saved: the shape, and every template parses. */
export const assertProviderTemplates = (
  syntax: SocialPostFeedTemplateSyntax,
  templates: SocialPostFeedTemplatesByProvider,
): void => {
  for (const [provider, template] of Object.entries(
    assertProviderTemplateShape(syntax, templates),
  )) {
    const field = `templatesByProvider.${provider}`
    if (looksLikeLegacyTemplate(template)) {
      throw validationException(
        field,
        "This template uses the old {title} tokens; write {{ title }} instead.",
      )
    }
    assertTemplate(field, template)
  }
}
