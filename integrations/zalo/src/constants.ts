export const MAX_BUTTONS = 5

export const TOKEN_EXPIRED_CODE = -1001

// API Base URLs
export const ZALO_OAUTH_BASE_URL = "https://oauth.zaloapp.com"
export const ZALO_API_BASE_URL = "https://openapi.zalo.me"

// API Endpoints
export const ZALO_API_ENDPOINTS = {
  AUTH: {
    PERMISSION: (version: string) =>
      `${ZALO_OAUTH_BASE_URL}/${version}/oa/permission`,
    ACCESS_TOKEN: (version: string) =>
      `${ZALO_OAUTH_BASE_URL}/${version}/oa/access_token`,
  },
  OA: {
    GET_PROFILE: "v2.0/oa/getoa",
    GET_USER_PROFILE: "v2.0/oa/getprofile",
    SEND_MESSAGE: "v3.0/oa/message/cs",
    UPLOAD_IMAGE: "v2.0/oa/upload/image",
    UPLOAD_FILE: "v2.0/oa/upload/file",
  },
} as const
