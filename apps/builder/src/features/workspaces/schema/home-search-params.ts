import { createSearchParamsCache, parseAsStringLiteral } from "nuqs/server"

/** The sections of the signed-in home page, in the order their tabs appear. */
export const homeTabs = ["workspaces", "templates"] as const

export type HomeTab = (typeof homeTabs)[number]

/**
 * The home page's URL state. An unknown `?tab=` falls back to the workspaces
 * tab, so a hand-edited or outdated link never breaks the page.
 */
export const homeSearchParamsCache = createSearchParamsCache({
  tab: parseAsStringLiteral(homeTabs).withDefault("workspaces"),
})
