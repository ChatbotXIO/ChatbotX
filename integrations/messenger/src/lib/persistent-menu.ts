import { encodeButtonPayload } from "@chatbotx.io/flow-config"
import type { FacebookButton } from "../schema"

/**
 * Structural shape of a stored persistent-menu item. Matches
 * `MessengerPersistentMenu` from `@chatbotx.io/database/partials` without
 * creating a dependency on the database package from this integration.
 */
export type PersistentMenuItem =
  | { label: string; type: "flow"; flowId: string }
  | { label: string; type: "url"; url: string }

/**
 * Convert stored persistent-menu items (flow | url) into Facebook
 * `call_to_actions` buttons. `flow` items become `postback` buttons whose
 * payload triggers the flow; `url` items become `web_url` buttons.
 */
export const messengerMenusToCallToActions = (
  menus: PersistentMenuItem[],
): FacebookButton[] => {
  const buttons: FacebookButton[] = []
  for (const menu of menus) {
    if (menu.type === "flow") {
      buttons.push({
        type: "postback",
        title: menu.label,
        payload: encodeButtonPayload({ flowId: menu.flowId }),
      })
    } else if (menu.type === "url") {
      buttons.push({
        type: "web_url",
        title: menu.label,
        url: menu.url,
      })
    }
  }
  return buttons
}
