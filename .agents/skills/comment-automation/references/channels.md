# Per-channel capability matrix (trap 6, full text)

6. **Five channels, one loop.** `type` is `messenger` | `instagram` (Instagram Login) |
   `instagramFacebook` (Instagram via Facebook Login) | `threads` | `tiktok` — see
   `CommentAutomationChannelType` — and `findActiveAutomations` filters on it, so every
   capability must be routed per channel. No capability is universal any more, so read
   the gate rather than assuming:

   | | messenger | instagram | instagramFacebook | threads | tiktok |
   |---|---|---|---|---|---|
   | public reply | ✅ | ✅ | ✅ | ✅ | ✅ |
   | private DM reply (`PRIVATE_REPLY_TEXT_SENDERS`) | ✅ | ✅ | ✅ | ❌ | ⚠️ |
   | like (`supportsCommentLike`) | ✅ | ✅ | ✅ | ❌ | ✅ |
   | hide (`supportsHideComments`) | ✅ | ✅ | ✅ | ✅ | ✅ |
   | attachment lookup (`hasImage`/`hasVideo` hide) | ✅ | ❌ | ❌ | ❌ | ❌ |
   | `onlyCommentsWithImage` reply filter (`commentAutomationChannelSupportsImageFilter`) | ✅ | ❌ | ❌ | ✅ | ❌ |
   | GIF hide (`commentAutomationChannelSupportsHideGif`) | ✅ | ❌ | ❌ | ✅ | ❌ |
   | tag tracking / `mentions` filter | ✅ exact | ✅ text | ✅ text | ✅ text | ✅ text |

   Threads has no DM API at all; it hides only TOP-LEVEL replies (`manage_reply` — the worker
   skips nested ones via `supportsHideForComment`) and
   answers `hasGif` from the reply's `gif_url`. TikTok's ⚠️ is **conditional**, not partial: through
   Comment-to-Message it CAN answer a comment with a DM addressed by `comment_id` alone,
   but only for comments TikTok's own classifier flagged as high intent (the
   `im_receive_high_intent_comment` webhook, which rides the `DIRECT_MESSAGE`
   subscription and needs the feature enabled per account). Dispatch is therefore
   deferred, not immediate — see `privateReplyRequiresHighIntent` and
   `deferred-private-reply.ts`. TikTok also rejects `flow` there (one comment-anchored
   message per comment; later steps have no `conversation_id`) and its window is 48
   hours, not Meta's 7 — `PRIVATE_REPLY_WINDOW_MS_BY_CHANNEL`. Hide an unsupported toggle
   in the builder form instead of shipping a dead switch.
