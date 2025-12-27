export const MAX_BUTTONS = 5

export const TOKEN_EXPIRED_CODE = -1001

// API Base URLs
export const ZALO_OAUTH_BASE_URL = "https://oauth.zaloapp.com"
export const ZALO_API_BASE_URL = "https://openapi.zalo.me"

// API Endpoints
export const ZALO_API_ENDPOINTS = {
  AUTH: {
    PERMISSION: "/v4/oa/permission",
    ACCESS_TOKEN: "v4/oa/access_token",
  },
  OA: {
    GET_PROFILE: "v2.0/oa/getoa",
    GET_USER_PROFILE: "v3.0/oa/user/detail",
    SEND_MESSAGE: "v3.0/oa/message/cs",
    UPLOAD_IMAGE: "v2.0/oa/upload/image",
    UPLOAD_FILE: "v2.0/oa/upload/file",
    UPLOAD_GIF: "v2.0/oa/upload/gif",
  },
} as const
