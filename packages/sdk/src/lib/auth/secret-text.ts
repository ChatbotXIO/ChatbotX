import type { AuthType, BaseAuthValue } from "./base"

export type SecretTextAuthValue = BaseAuthValue & {
  authType: typeof AuthType.secretText
  secretText: string
}
