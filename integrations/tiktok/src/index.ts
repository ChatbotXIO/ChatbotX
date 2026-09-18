export { generateAuthUrl } from "./apis/auth"
export { subscribeWebhook } from "./apis/webhook"
export * from "./integration"
export { isRevokedTokenError, mapToChannelError } from "./lib/error-mapper"
export {
  parseTiktokScopes,
  TIKTOK_COMMENT_AUTOMATION_SCOPES,
  tiktokNeedsReauthorization,
} from "./lib/scopes"
export type {
  TiktokAuthValue,
  TiktokComment,
  TiktokCommentHideAction,
  TiktokCommentLikeAction,
  TiktokCommentListResult,
  TiktokCommentStatus,
  TiktokConfig,
  TiktokVideo,
  TiktokVideoListResult,
  TiktokWebhookEvent,
} from "./schema"
