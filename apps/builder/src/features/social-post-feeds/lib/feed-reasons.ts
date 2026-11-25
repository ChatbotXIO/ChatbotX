import type { FeedReasonKey } from "./feed-labels"

/**
 * Reason codes the runner writes for an item, mapped to their message key. The
 * publishing rules' issue codes (`textTooLong`, `tooManyLinks`, ...) follow
 * `socialPostContentInvalid` in the same list, so the person sees what was wrong.
 */
const REASON_KEYS = {
  accountDisconnected: "issueDestination",
  accountNeedsReauth: "issueDestination",
  aiFallback: "aiFallback",
  alreadyPosted: "alreadyPosted",
  category: "category",
  contentTypeDisabled: "issueContentType",
  contentTypeNotSupported: "issueContentType",
  destinationInactive: "issueDestination",
  destinationNotFound: "issueDestination",
  droppedTargets: "droppedTargets",
  emptyText: "emptyText",
  excludedKeyword: "excludedKeyword",
  existing: "existing",
  firstCommentNotSupported: "issueParts",
  imageFailed: "imageFailed",
  inboxDisconnected: "issueDestination",
  inboxNeedsReconnect: "issueDestination",
  linkNotSupported: "issueLinkNotSupported",
  linkRequired: "issueLinkRequired",
  mediaFormatNotSupported: "issueMedia",
  mediaKindNotAllowed: "issueMedia",
  mediaTooFew: "issueMedia",
  mediaTooLarge: "issueMedia",
  mediaTooLong: "issueMedia",
  mediaTooMany: "issueMedia",
  mediaTooShort: "issueMedia",
  missingKeyword: "missingKeyword",
  noDestination: "noDestination",
  noDestinationAccepts: "noDestinationAccepts",
  noImage: "noImage",
  noImageFallback: "noImageFallback",
  optionsInvalid: "issueOptions",
  partsNotSupported: "issueParts",
  partTextRequired: "issueParts",
  partTextTooLong: "issueTextTooLong",
  perRunLimit: "perRunLimit",
  publishPermissionMissing: "issueDestination",
  socialPostContentInvalid: "invalid",
  templateError: "templateError",
  textRequired: "issueTextRequired",
  textTooLong: "textTooLong",
  tooManyLinks: "issueTooManyLinks",
  tooManyParts: "issueParts",
  tooOld: "tooOld",
  tooOldForFilter: "tooOldForFilter",
  undated: "undated",
  undatedForFilter: "undatedForFilter",
  validation: "invalid",
} as const satisfies Record<string, FeedReasonKey>

const reasonKeyOf = (reason: string): FeedReasonKey =>
  Object.hasOwn(REASON_KEYS, reason)
    ? REASON_KEYS[reason as keyof typeof REASON_KEYS]
    : "other"

/** A ledger reason may list several notes, comma separated; repeats of one message are shown once. */
export const reasonKeysOf = (reason: string): FeedReasonKey[] => [
  ...new Set(reason.split(",").map(reasonKeyOf)),
]
