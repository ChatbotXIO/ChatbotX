import type { TiktokCommenterIdentity } from "./tiktok-comment-identity"

/**
 * Who wrote a TikTok comment, as far as the automation is concerned.
 * `unknown` withholds the automation: answering what might be the account's
 * own comment would have it replying to itself.
 */
export type TiktokAuthorship = "owner" | "commenter" | "unknown"

/**
 * The lookup's `owner` flag decides when there is one. Without it, the
 * account's remembered `unique_identifier` decides: the webhook reports every
 * commenter in that same id space, so a different id is someone else.
 *
 * Kept free of runtime imports so tests can use the real rule.
 */
export function resolveTiktokAuthorship(props: {
  identity: TiktokCommenterIdentity | undefined
  fromId: string
  ownerUniqueIdentifier: string | undefined
}): TiktokAuthorship {
  if (props.identity) {
    return props.identity.isOwner ? "owner" : "commenter"
  }
  if (!props.ownerUniqueIdentifier) {
    return "unknown"
  }
  return props.fromId === props.ownerUniqueIdentifier ? "owner" : "commenter"
}
