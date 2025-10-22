export const AuthType = {
  none: "none",
  basicAuth: "basicAuth",
  oauth2: "oauth2",
  secretText: "secretText",
} as const

export type AuthType = (typeof AuthType)[keyof typeof AuthType]

export type BaseAuthValue = {
  authType: AuthType
}

export type NoneAuthValue = BaseAuthValue
