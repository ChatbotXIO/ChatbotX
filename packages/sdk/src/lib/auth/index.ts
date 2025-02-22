import type { Oauth2AuthValue } from "./oauth2"
import type { SecretTextAuthValue } from "./secret-text"

export * from "./base"
export * from "./oauth2"
export * from "./secret-text"

export type AuthValue = Oauth2AuthValue | SecretTextAuthValue
