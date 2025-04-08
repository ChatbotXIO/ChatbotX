export enum AuthType {
  NONE = "NONE",
  BASIC_AUTH = "BASIC_AUTH",
  OAUTH2 = "OAUTH2",
  SECRET_TEXT = "SECRET_TEXT",
}

export type BaseAuthValue = {
  authType: AuthType
}

export type NoneAuthValue = BaseAuthValue
