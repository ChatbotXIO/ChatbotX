export { generateAuthUrl } from "./apis/auth"
export { subscribeWebhook } from "./apis/webhook"
export {
  TIKTOK_MISSING_SCOPES_CODE,
  TiktokMissingScopesError,
} from "./exception"
export * from "./integration"
export { isRevokedTokenError, mapToChannelError } from "./lib/error-mapper"
export {
  findMissingTiktokScopes,
  parseTiktokScopes,
  TIKTOK_COMMENT_AUTOMATION_SCOPES,
  TIKTOK_CORE_SCOPES,
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
