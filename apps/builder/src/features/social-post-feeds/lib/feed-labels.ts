/**
 * Message keys of the feed texts that depend on a stored code. Written out in
 * full (not built from the code) so every key is checked against the messages.
 */
export const FEED_REASON_MESSAGES = {
  aiFallback: "posts.feeds.items.reasons.aiFallback",
  alreadyPosted: "posts.feeds.items.reasons.alreadyPosted",
  category: "posts.feeds.items.reasons.category",
  droppedTargets: "posts.feeds.items.reasons.droppedTargets",
  emptyText: "posts.feeds.items.reasons.emptyText",
  excludedKeyword: "posts.feeds.items.reasons.excludedKeyword",
  existing: "posts.feeds.items.reasons.existing",
  imageFailed: "posts.feeds.items.reasons.imageFailed",
  invalid: "posts.feeds.items.reasons.invalid",
  issueContentType: "posts.feeds.items.reasons.issueContentType",
  issueDestination: "posts.feeds.items.reasons.issueDestination",
  issueLinkNotSupported: "posts.feeds.items.reasons.issueLinkNotSupported",
  issueLinkRequired: "posts.feeds.items.reasons.issueLinkRequired",
  issueMedia: "posts.feeds.items.reasons.issueMedia",
  issueOptions: "posts.feeds.items.reasons.issueOptions",
  issueParts: "posts.feeds.items.reasons.issueParts",
  issueTextRequired: "posts.feeds.items.reasons.issueTextRequired",
  issueTextTooLong: "posts.feeds.items.reasons.issueTextTooLong",
  issueTooManyLinks: "posts.feeds.items.reasons.issueTooManyLinks",
  missingKeyword: "posts.feeds.items.reasons.missingKeyword",
  noDestination: "posts.feeds.items.reasons.noDestination",
  noDestinationAccepts: "posts.feeds.items.reasons.noDestinationAccepts",
  noImage: "posts.feeds.items.reasons.noImage",
  noImageFallback: "posts.feeds.items.reasons.noImageFallback",
  other: "posts.feeds.items.reasons.other",
  perRunLimit: "posts.feeds.items.reasons.perRunLimit",
  templateError: "posts.feeds.items.reasons.templateError",
  textTooLong: "posts.feeds.items.reasons.textTooLong",
  tooOld: "posts.feeds.items.reasons.tooOld",
  tooOldForFilter: "posts.feeds.items.reasons.tooOldForFilter",
  undated: "posts.feeds.items.reasons.undated",
  undatedForFilter: "posts.feeds.items.reasons.undatedForFilter",
} as const

export type FeedReasonKey = keyof typeof FEED_REASON_MESSAGES

export const FEED_IMAGE_SOURCE_MESSAGES = {
  article: "posts.feeds.items.imageSources.article",
  contentImage: "posts.feeds.items.imageSources.contentImage",
  enclosure: "posts.feeds.items.imageSources.enclosure",
  field: "posts.feeds.items.imageSources.field",
  itunesImage: "posts.feeds.items.imageSources.itunesImage",
  jsonFeed: "posts.feeds.items.imageSources.jsonFeed",
  library: "posts.feeds.items.imageSources.library",
  mediaContent: "posts.feeds.items.imageSources.mediaContent",
  mediaThumbnail: "posts.feeds.items.imageSources.mediaThumbnail",
} as const

export const FEED_IMAGE_ERROR_MESSAGES = {
  articleNoImage: "posts.feeds.items.imageErrors.articleNoImage",
  articleUnreachable: "posts.feeds.items.imageErrors.articleUnreachable",
  blocked: "posts.feeds.items.imageErrors.blocked",
  notImage: "posts.feeds.items.imageErrors.notImage",
  storage: "posts.feeds.items.imageErrors.storage",
  tooBig: "posts.feeds.items.imageErrors.tooBig",
  unreachable: "posts.feeds.items.imageErrors.unreachable",
} as const

export const FEED_PRESET_MESSAGES = {
  presetProduct: "posts.feeds.form.presetProduct",
  presetSummaryHashtags: "posts.feeds.form.presetSummaryHashtags",
  presetTitleLink: "posts.feeds.form.presetTitleLink",
} as const
