import type { AuthType, BaseAuthValue } from "./base"

export type SecretTextAuthValue = BaseAuthValue & {
  authType: typeof AuthType.SECRET_TEXT
  secretText: string
}
