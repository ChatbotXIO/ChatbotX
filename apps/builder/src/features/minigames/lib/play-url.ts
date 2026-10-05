import { getBrokerOrigin } from "@/lib/oauth-broker"

/**
 * The public play link the edit page's "Copy URL" shows and the public API
 * returns, so the two cannot drift. `{{minigame_play_token}}` is a contact
 * variable: when the link is sent from a flow (button, message) it is
 * replaced with a signed token identifying the contact, which is what lets
 * the play page attribute the spin to them.
 */
export const buildMinigamePlayUrl = (minigameId: string): string =>
  `${getBrokerOrigin()}/minigames?minigameId=${minigameId}&token={{minigame_play_token}}`
