import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"

/**
 * Client-safe subset of the webchat config. The full `IntegrationWebchatModel`
 * row carries secrets (`auth`) that must never cross the server → client
 * boundary, so the guest widget only ever receives these allow-listed,
 * non-sensitive fields. Build this DTO server-side and pass it (never the
 * raw row) into the guest session store.
 */
export type WebchatClientConfig = Pick<
  IntegrationWebchatModel,
  | "id"
  | "workspaceId"
  | "name"
  | "brandColor"
  | "hideHeader"
  | "showLogo"
  | "hideMessageInput"
  | "welcomeFlowId"
  | "persistentMenus"
>

export const toWebchatClientConfig = (
  webchat: IntegrationWebchatModel,
): WebchatClientConfig => ({
  id: webchat.id,
  workspaceId: webchat.workspaceId,
  name: webchat.name,
  brandColor: webchat.brandColor,
  hideHeader: webchat.hideHeader,
  showLogo: webchat.showLogo,
  hideMessageInput: webchat.hideMessageInput,
  welcomeFlowId: webchat.welcomeFlowId,
  persistentMenus: webchat.persistentMenus,
})
