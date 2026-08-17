import type { FBCommentHideComments } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"

const PHONE_RE = /\+?\d[\d\s\-().]{7,}/
// `http(s)://`/`www.` links match case-insensitively — the scheme itself is
// never meaningfully cased. Bare domains without a scheme (e.g. "example.com",
// common since Facebook comments frequently omit `http(s)://`) are matched
// case-SENSITIVELY on purpose: real domains are written lowercase, while a
// missing space after a sentence-ending period produces a capitalized
// continuation word (e.g. "ban.Shop", "ngay.Info") that would otherwise be
// misdetected as a link. `co` is deliberately excluded from the bare list —
// it's too common as a standalone lowercase word/abbreviation (e.g.
// "picture.co founder") to distinguish from a real ".co" domain; a bare `.co`
// link still needs `www.`/`http(s)://` to be caught.
const SCHEME_LINK_RE = /https?:\/\/|www\./i
const BARE_DOMAIN_RE =
  /\b[a-z0-9-]+\.(?:com|net|org|io|vn|shop|store|info|biz)\b/

function hasLink(text: string): boolean {
  return SCHEME_LINK_RE.test(text) || BARE_DOMAIN_RE.test(text)
}

const UNHIDE_DELAY_MS: Record<string, number> = {
  "6h": 6 * 3_600_000,
  "12h": 12 * 3_600_000,
  "1d": 86_400_000,
  "2d": 2 * 86_400_000,
  "3d": 3 * 86_400_000,
  "4d": 4 * 86_400_000,
  "5d": 5 * 86_400_000,
  "6d": 6 * 86_400_000,
  "7d": 7 * 86_400_000,
  "8d": 8 * 86_400_000,
  "9d": 9 * 86_400_000,
  "10d": 10 * 86_400_000,
}

export async function applyHideComments(
  hideComments: FBCommentHideComments,
  commentId: string,
  message: string | undefined,
  ctx: {
    conversation: ConversationModel
    contactInbox: ContactInboxModel
    messageId: string
    messageCreatedAt: Date
    hasImage: boolean
    hasVideo: boolean
  },
) {
  const text = message ?? ""
  const lowerText = text.toLowerCase()

  const shouldHide =
    hideComments.all ||
    (hideComments.hasPhoneNumber && PHONE_RE.test(text)) ||
    (hideComments.hasLink && hasLink(text)) ||
    (hideComments.hasKeywords &&
      hideComments.keywords.some((k) => lowerText.includes(k.toLowerCase()))) ||
    (hideComments.hasImage && ctx.hasImage) ||
    (hideComments.hasVideo && ctx.hasVideo)

  if (!shouldHide) {
    return
  }

  await chatQueue.add(ChatJobAction.changeChannelMessageState, {
    type: ChatJobAction.changeChannelMessageState,
    data: {
      conversation: ctx.conversation,
      contactInbox: ctx.contactInbox,
      message: { id: ctx.messageId, createdAt: ctx.messageCreatedAt },
      hidden: true,
    },
  })

  if (hideComments.showCommentsAfter !== "none") {
    const delay = UNHIDE_DELAY_MS[hideComments.showCommentsAfter] ?? 0
    await chatQueue.add(
      ChatJobAction.changeChannelMessageState,
      {
        type: ChatJobAction.changeChannelMessageState,
        data: {
          conversation: ctx.conversation,
          contactInbox: ctx.contactInbox,
          message: { id: ctx.messageId, createdAt: ctx.messageCreatedAt },
          hidden: false,
        },
      },
      { delay, jobId: `unhide-comment-${commentId}` },
    )
  }
}
