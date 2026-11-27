import {
  createSearchParamsCache,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server"

/** The sections of the signed-in home page, in the order their tabs appear. */
export const homeTabs = ["workspaces", "templates"] as const

export type HomeTab = (typeof homeTabs)[number]

/**
 * The home page's URL state. An unknown `?tab=` falls back to the workspaces
 * tab, so a hand-edited or outdated link never breaks the page. `key` is the
 * share key of the template opened inside the Templates tab, the same key a
 * template's share link carries.
 */
export const homeSearchParamsCache = createSearchParamsCache({
  tab: parseAsStringLiteral(homeTabs).withDefault("workspaces"),
  key: parseAsString,
})

/** Opens one template inside the home page's Templates tab, where it can be installed. */
export const buildHomeTemplateHref = (template: {
  shareToken: string
}): string =>
  `/?${new URLSearchParams({ tab: "templates", key: template.shareToken })}`
