import type { TemplateActor } from "@chatbotx.io/business"
export const TAGS = ["Templates"]
export const INSTALLATION_TAGS = ["Template installations"]

type TokenContext = {
  apiToken?: { permission: string } | undefined
  headers: Headers
}

/** The token's own power; anything but an explicit `full` token is read-only. */
export const tokenActor = (context: TokenContext): TemplateActor => ({
  kind: "apiToken",
  permission: context.apiToken?.permission === "full" ? "full" : "read_only",
})
