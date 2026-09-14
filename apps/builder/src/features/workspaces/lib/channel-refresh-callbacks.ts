import type { ChannelTokenRefreshCallbacks } from "@chatbotx.io/business"
import {
  type InstagramAuthValue,
  integration as integrationInstagram,
} from "@chatbotx.io/integration-instagram"
import { integration as integrationInstagramFacebook } from "@chatbotx.io/integration-instagram-facebook"
import {
  integration as integrationMessenger,
  type MessengerAuthValue,
} from "@chatbotx.io/integration-messenger"
import {
  integration as integrationWhatsapp,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"

/**
 * `channelTokenRefreshService.refreshWorkspace` (packages/business) does not
 * depend on `@chatbotx.io/integration-instagram`, `-instagram-facebook`,
 * `-messenger`, or `-whatsapp` — each already depends on
 * `@chatbotx.io/business`, so a reverse dependency would create a workspace
 * cycle (see that service's own doc comment). `apps/builder` has no such
 * constraint, so every caller of `refreshWorkspace` wires the concrete
 * provider calls once, here, and injects them as primitives.
 */
export const channelTokenRefreshCallbacks: ChannelTokenRefreshCallbacks = {
  refreshInstagramAuth: (auth) =>
    integrationInstagram.refreshAuth?.({
      auth: auth as InstagramAuthValue,
    }) as Promise<Record<string, unknown>>,
  refreshInstagramFacebookAuth: (auth) =>
    integrationInstagramFacebook.refreshAuth?.({
      auth: auth as InstagramAuthValue,
    }) as Promise<Record<string, unknown>>,
  refreshMessengerAuth: (auth) =>
    integrationMessenger.refreshAuth?.({
      auth: auth as MessengerAuthValue,
    }) as Promise<Record<string, unknown>>,
  refreshWhatsappAuth: (auth) =>
    integrationWhatsapp.refreshAuth?.({
      auth: auth as WhatsappAuthValue,
    }) as Promise<Record<string, unknown>>,
}
