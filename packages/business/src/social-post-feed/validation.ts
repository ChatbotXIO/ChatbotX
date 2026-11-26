import {
  MAX_FEED_FALLBACK_IMAGES,
  type SocialPostFeedFilters,
  type SocialPostFeedTemplateSyntax,
  type SocialPostFeedTemplatesByProvider,
  socialPostFeedFilters,
} from "@chatbotx.io/database/partials"
import {
  type SocialPostFeedRow,
  socialPostRepository,
  socialPostSnippetRepository,
} from "@chatbotx.io/database/repositories"
import { looksLikeLegacyTemplate } from "@chatbotx.io/utils/feed-template"
import { validationException } from "../errors"
import { mediaLibraryFileService } from "../media-library-file/service"
import {
  MAX_DESTINATIONS_PER_POST_FEED,
  MAX_POST_FEED_AI_INSTRUCTIONS_LENGTH,
  MAX_POST_FEED_DAILY_CAP,
  MAX_POST_FEED_INTERVAL_MINUTES,
  MAX_POST_FEED_ITEMS_PER_RUN,
  MAX_POST_FEED_NAME_LENGTH,
  MAX_POST_FEED_TEMPLATE_LENGTH,
  MIN_POST_FEED_INTERVAL_MINUTES,
} from "./limits"
import { assertProviderTemplates, assertTemplate } from "./template-check"
import { registeredFeedAiModelChecker } from "./writer"

export function assertSettings(input: {
  aiInstructions?: string | null
  dailyCap?: number
  intervalMinutes?: number
  maxItemsPerRun?: number
  mediaField?: string | null
  name?: string
  textTemplate?: string
}): void {
  const bounded = (
    field: string,
    value: number | undefined,
    min: number,
    max: number,
  ) => {
    if (
      value !== undefined &&
      !(Number.isInteger(value) && value >= min && value <= max)
    ) {
      throw validationException(
        field,
        `Use a whole number from ${min} to ${max}`,
      )
    }
  }
  bounded(
    "intervalMinutes",
    input.intervalMinutes,
    MIN_POST_FEED_INTERVAL_MINUTES,
    MAX_POST_FEED_INTERVAL_MINUTES,
  )
  bounded("dailyCap", input.dailyCap, 1, MAX_POST_FEED_DAILY_CAP)
  bounded(
    "maxItemsPerRun",
    input.maxItemsPerRun,
    1,
    MAX_POST_FEED_ITEMS_PER_RUN,
  )
  if (
    input.aiInstructions &&
    input.aiInstructions.length > MAX_POST_FEED_AI_INSTRUCTIONS_LENGTH
  ) {
    throw validationException(
      "aiInstructions",
      `The instructions are longer than ${MAX_POST_FEED_AI_INSTRUCTIONS_LENGTH} characters`,
    )
  }
  if (
    input.name !== undefined &&
    !(input.name.trim() && input.name.length <= MAX_POST_FEED_NAME_LENGTH)
  ) {
    throw validationException("name", "The name is empty or too long")
  }
  if (
    input.mediaField !== undefined &&
    input.mediaField !== null &&
    input.mediaField.length > MAX_POST_FEED_TEMPLATE_LENGTH
  ) {
    throw validationException("mediaField", "The picture field is too long")
  }
  if (
    input.textTemplate !== undefined &&
    !(
      input.textTemplate.trim() &&
      input.textTemplate.length <= MAX_POST_FEED_TEMPLATE_LENGTH
    )
  ) {
    throw validationException(
      "textTemplate",
      "The text template is empty or too long",
    )
  }
}

/** The picture field is a template in the feed's language: v2 parses, legacy has no {{ }} tags. */
function assertMediaField(
  syntax: SocialPostFeedTemplateSyntax,
  mediaField: string,
): void {
  if (syntax === "v2") {
    assertTemplate("mediaField", mediaField)
    return
  }
  if (mediaField.includes("{{")) {
    throw validationException(
      "mediaField",
      "A legacy feed's picture field cannot contain {{ }} tags; use {title}, {link} and {summary}, or set templateSyntax v2.",
    )
  }
}

/** Content settings: the template parses in its language, the picture fields make sense, library pictures are the workspace's own. */
export async function assertContent(
  workspaceId: string,
  input: {
    filters?: SocialPostFeedFilters | null
    mediaField?: string | null
    mediaLibraryFileIds?: string[]
    mediaMode?: string
    syntax: SocialPostFeedTemplateSyntax
    templatesByProvider?: SocialPostFeedTemplatesByProvider
    textTemplate?: string
  },
): Promise<void> {
  if (input.templatesByProvider !== undefined) {
    assertProviderTemplates(input.syntax, input.templatesByProvider)
  }
  if (input.textTemplate !== undefined && input.syntax === "v2") {
    if (looksLikeLegacyTemplate(input.textTemplate)) {
      throw validationException(
        "textTemplate",
        "This template uses the old {title} tokens; write {{ title }} instead, or keep templateSyntax legacy.",
      )
    }
    assertTemplate("textTemplate", input.textTemplate)
  }
  if (input.mediaField) {
    assertMediaField(input.syntax, input.mediaField)
  }
  if (input.mediaMode === "field" && !input.mediaField?.trim()) {
    throw validationException(
      "mediaField",
      "Give the field or address template the picture comes from.",
    )
  }
  if (input.filters) {
    const parsed = socialPostFeedFilters.safeParse(input.filters)
    if (!parsed.success) {
      throw validationException("filters", "The filters are not valid")
    }
  }
  const ids = input.mediaLibraryFileIds ?? []
  if (
    ids.length > MAX_FEED_FALLBACK_IMAGES ||
    new Set(ids).size !== ids.length
  ) {
    throw validationException(
      "mediaLibraryFileIds",
      `Give at most ${MAX_FEED_FALLBACK_IMAGES} different pictures.`,
    )
  }
  for (const id of ids) {
    const file = await mediaLibraryFileService.findById({ id, workspaceId })
    if (!file?.mimeType.startsWith("image/")) {
      throw validationException(
        "mediaLibraryFileIds",
        "A picture was not found in the Media Library.",
      )
    }
  }
}

/** A picked AI integration must be a usable one of this workspace; a foreign id is refused. */
export async function assertAiChoice(
  workspaceId: string,
  choice: { aiIntegrationId?: string | null; aiModel?: string | null },
): Promise<void> {
  if (!(choice.aiIntegrationId && choice.aiModel)) {
    return
  }
  const check = registeredFeedAiModelChecker()
  const usable = check
    ? await check({
        integrationId: choice.aiIntegrationId,
        model: choice.aiModel,
        workspaceId,
      })
    : false
  if (!usable) {
    throw validationException("aiIntegrationId", "AI integration not found.")
  }
}

export async function assertDestinations(
  workspaceId: string,
  destinationIds: string[],
): Promise<void> {
  if (
    destinationIds.length === 0 ||
    new Set(destinationIds).size !== destinationIds.length ||
    destinationIds.length > MAX_DESTINATIONS_PER_POST_FEED
  ) {
    throw validationException(
      "destinationIds",
      `Give 1 to ${MAX_DESTINATIONS_PER_POST_FEED} destinations, each once.`,
    )
  }
  const found = await socialPostRepository.findDestinations({
    ids: destinationIds,
    workspaceId,
  })
  if (found.length !== destinationIds.length) {
    throw validationException("destinationIds", "A destination was not found.")
  }
}

export async function assertSignature(
  workspaceId: string,
  signatureId: string | null | undefined,
): Promise<void> {
  if (!signatureId) {
    return
  }
  const snippet = await socialPostSnippetRepository.findById({
    id: signatureId,
    workspaceId,
  })
  if (snippet?.kind !== "signature") {
    throw validationException("signatureId", "Signature not found.")
  }
}

/**
 * The language a saved template is read in. A feed created before the template
 * language stays `legacy` until its owner saves a converted template WITH
 * `templateSyntax: "v2"`; saving other settings, or a template without
 * stating the syntax, never changes it.
 */
export function syntaxForUpdate(
  current: SocialPostFeedRow,
  changes: {
    templateSyntax?: SocialPostFeedTemplateSyntax
    textTemplate?: string
  },
): SocialPostFeedTemplateSyntax {
  const syntax = changes.templateSyntax ?? current.templateSyntax
  if (
    syntax === "v2" &&
    current.templateSyntax === "legacy" &&
    changes.textTemplate === undefined
  ) {
    throw validationException(
      "textTemplate",
      "Send the converted template together with templateSyntax v2.",
    )
  }
  if (syntax === "legacy") {
    // A v2 template read as legacy would publish its {{ }} tags literally.
    if (current.templateSyntax === "v2" && changes.textTemplate === undefined) {
      throw validationException(
        "textTemplate",
        "Send a template written with {title}, {link} and {summary} together with templateSyntax legacy.",
      )
    }
    if (changes.textTemplate?.includes("{{")) {
      throw validationException(
        "textTemplate",
        "A legacy template cannot contain {{ }} tags; use {title}, {link} and {summary}, or set templateSyntax v2.",
      )
    }
  }
  return syntax
}

export type AiChoice = {
  aiIntegrationId: string | null
  aiModel: string | null
}

/** An AI integration and a model go together: both, or neither. */
export function assertAiPair(choice: {
  aiIntegrationId?: string | null
  aiModel?: string | null
}): void {
  if (Boolean(choice.aiIntegrationId) !== Boolean(choice.aiModel)) {
    throw validationException(
      "aiModel",
      "Choose both an AI integration and a model, or neither",
    )
  }
}

/**
 * The AI choice a save leaves the feed with: the stored pair, with whichever
 * half the patch names replaced. `changed` is true when the patch names either
 * half, so the pair is validated and written as a pair.
 */
export function effectiveAiChoice(
  current: Pick<SocialPostFeedRow, "aiIntegrationId" | "aiModel">,
  changes: { aiIntegrationId?: string | null; aiModel?: string | null },
): AiChoice & { changed: boolean } {
  return {
    aiIntegrationId:
      changes.aiIntegrationId === undefined
        ? current.aiIntegrationId
        : changes.aiIntegrationId,
    aiModel: changes.aiModel === undefined ? current.aiModel : changes.aiModel,
    changed:
      changes.aiIntegrationId !== undefined || changes.aiModel !== undefined,
  }
}
