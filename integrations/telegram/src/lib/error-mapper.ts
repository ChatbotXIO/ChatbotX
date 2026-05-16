import {
  ChannelError,
  ChannelErrorCategory,
  UNKNOWN_ERROR,
} from "@chatbotx.io/sdk"
import {
  type ChannelErrorSource,
  parseOriginError,
  TelegramAPIException,
} from "../exception"

function extractApiFields(exc: TelegramAPIException): ChannelErrorSource {
  return {
    message: exc.message,
    code: exc.code,
    subCode: exc.subCode ?? null,
    type: exc.type,
    httpStatusCode: exc.httpStatusCode,
  }
}

// === Telegram MTProto + Bot API error categorization ===
// Patterns are lowercased substrings matched against description text.
// Covers both UPPER_CASE RPC types (e.g. AUTH_KEY_UNREGISTERED) and
// Bot API human descriptions (e.g. "bot was blocked by the user").

const AUTH_FAILED_PATTERNS = [
  "auth_key_unregistered",
  "auth_key_invalid",
  "auth_key_perm_empty",
  "auth_key_duplicated",
  "session_revoked",
  "session_expired",
  "api_id_invalid",
]

const USER_BLOCKED_PATTERNS = [
  "user_is_blocked",
  "you_blocked_user",
  "user_privacy_restricted",
  "user_not_participant",
  "chat_write_forbidden",
  "bot was blocked by the user",
  "bot can't initiate conversation with a user",
  "bot can't send messages to bots",
  "user is restricted",
]

const INVALID_RECIPIENT_PATTERNS = [
  "user_deactivated",
  "phone_number_unoccupied",
  "user is deactivated",
  "chat not found",
  "user not found",
  "the group chat was deleted",
  "group chat was upgraded to a supergroup",
  "bot was kicked",
  "chat_id is empty",
  "peer_id_invalid",
]

const PERMISSION_DENIED_PATTERNS = [
  "chat_admin_required",
  "not enough rights",
  "method is available only for supergroups",
  "bot is not a member",
]

const RATE_LIMITED_PATTERNS = [
  "flood_wait",
  "flood_premium_wait",
  "slowmode_wait",
  "2fa_confirm_wait",
  "too many requests",
  "retry after",
]

const NETWORK_ERROR_PATTERNS = [
  "file_migrate",
  "phone_migrate",
  "network_migrate",
  "user_migrate",
  "etimedout",
  "econnreset",
  "webhook error",
]

const PAYLOAD_INVALID_PATTERNS = [
  // MTProto 400 types
  "firstname_invalid",
  "lastname_invalid",
  "phone_number_invalid",
  "phone_number_occupied",
  "phone_code_hash_empty",
  "phone_code_empty",
  "phone_code_expired",
  "users_too_few",
  "users_too_much",
  "type_constructor_invalid",
  "file_part_invalid",
  "file_parts_invalid",
  "file_part",
  "md5_checksum_invalid",
  "photo_invalid_dimensions",
  "field_name_invalid",
  "field_name_empty",
  // Bot API descriptions
  "message to delete not found",
  "message can't be deleted",
  "message is too long",
  "wrong file identifier",
  "failed to get http url content",
  "entity too large",
  "button_data_invalid",
  "query is too old",
  "bad webhook",
  "file is too big",
  "image_process_failed",
  "sticker_png_dimensions",
  "terminated by other getupdates",
  "can't use getupdates method",
]

function matchesAny(description: string, patterns: string[]): boolean {
  return patterns.some((p) => description.includes(p))
}

function categorize(
  httpStatus: number,
  description: string,
): ChannelErrorCategory {
  // Description pattern match (most specific)
  if (matchesAny(description, AUTH_FAILED_PATTERNS)) {
    return ChannelErrorCategory.AUTH_FAILED
  }
  if (matchesAny(description, USER_BLOCKED_PATTERNS)) {
    return ChannelErrorCategory.USER_BLOCKED
  }
  if (matchesAny(description, INVALID_RECIPIENT_PATTERNS)) {
    return ChannelErrorCategory.INVALID_RECIPIENT
  }
  if (matchesAny(description, PERMISSION_DENIED_PATTERNS)) {
    return ChannelErrorCategory.PERMISSION_DENIED
  }
  if (matchesAny(description, RATE_LIMITED_PATTERNS)) {
    return ChannelErrorCategory.RATE_LIMITED
  }
  if (matchesAny(description, NETWORK_ERROR_PATTERNS)) {
    return ChannelErrorCategory.NETWORK_ERROR
  }
  if (matchesAny(description, PAYLOAD_INVALID_PATTERNS)) {
    return ChannelErrorCategory.PAYLOAD_INVALID
  }

  // HTTP status fallback
  if (httpStatus === 303) {
    return ChannelErrorCategory.NETWORK_ERROR
  }
  if (httpStatus === 401) {
    return ChannelErrorCategory.AUTH_FAILED
  }
  if (httpStatus === 403) {
    return ChannelErrorCategory.USER_BLOCKED
  }
  if (httpStatus === 420 || httpStatus === 429) {
    return ChannelErrorCategory.RATE_LIMITED
  }
  if (
    httpStatus === 400 ||
    httpStatus === 404 ||
    httpStatus === 405 ||
    httpStatus === 406 ||
    httpStatus === 409
  ) {
    return ChannelErrorCategory.PAYLOAD_INVALID
  }
  if (httpStatus >= 500) {
    return ChannelErrorCategory.NETWORK_ERROR
  }

  return ChannelErrorCategory.UNKNOWN
}

function mapTelegramStatus(fields: ChannelErrorSource): ChannelError {
  const description = (fields.message ?? "").toLowerCase()
  const category = categorize(fields.httpStatusCode, description)
  return new ChannelError(fields.message ?? UNKNOWN_ERROR.message, category, {
    code: fields.code ?? UNKNOWN_ERROR.code,
    httpStatusCode: fields.httpStatusCode,
  })
}

// === Revoked / invalidated access token detection ===
// Telegram bot tokens are not "revoked" per se — invalid bot tokens manifest as
// 401 Unauthorized or AUTH_KEY_* RPC errors. Use ChannelErrorCategory.AUTH_FAILED
// for reconnect prompts. Always returns false.
export function isRevokedTokenError(_error: unknown): boolean {
  return false
}

export function mapToChannelError(rawError: unknown): ChannelError {
  if (rawError instanceof ChannelError) {
    return rawError
  }

  if (rawError instanceof TelegramAPIException) {
    return mapTelegramStatus(extractApiFields(rawError))
  }

  return mapTelegramStatus(parseOriginError(rawError))
}
