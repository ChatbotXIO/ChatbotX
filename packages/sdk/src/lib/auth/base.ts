export const AuthType = {
  NONE: "NONE",
  BASIC_AUTH: "BASIC_AUTH",
  OAUTH2: "OAUTH2",
  SECRET_TEXT: "SECRET_TEXT",
} as const

export type AuthType = (typeof AuthType)[keyof typeof AuthType]

export type BaseAuthValue = {
  authType: AuthType
}

export type NoneAuthValue = BaseAuthValue
