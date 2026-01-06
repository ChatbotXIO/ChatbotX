export const MAILCHIMP_OAUTH_URL = "https://login.mailchimp.com/oauth2"

export const MAILCHIMP_API_ENDPOINTS = {
  AUTHORIZE: `${MAILCHIMP_OAUTH_URL}/authorize`,
  TOKEN: `${MAILCHIMP_OAUTH_URL}/token`,
  METADATA: `${MAILCHIMP_OAUTH_URL}/metadata`,
} as const

export const MAILCHIMP_DEFAULT_PAGE_SIZE = 1000

export const MAILCHIMP_INTEGRATION_NAME = "mailchimp"
