import type { AuthType, BaseAuthValue } from "./base"

export type SecretTextAuthValue = BaseAuthValue & {
  authType: AuthType.SECRET_TEXT
  secretText: string
}
