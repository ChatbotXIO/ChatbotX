import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { isBigintId } from "@chatbotx.io/database/utils"
import { mapStringLeaves } from "@chatbotx.io/flow-config"
import { decodeBase62, encodeBase62 } from "@chatbotx.io/utils"
import type {
  TemplateHardDependency,
  TemplateInstallContext,
} from "./adapters/types"

/** What a pattern needs to rewrite a link: the workspaces and what this install created. */
type LinkRewriteContext = {
  sourceWorkspaceId: string
  targetWorkspaceId: string
  idMaps: TemplateInstallContext["idMaps"]
  /** Source magic-link name -> the name its copy got (every copied link, renamed or not). */
  magicLinkNameBindings: ReadonlyMap<string, string>
}

/** The text a pattern produces, or `null` when the link names something this install did not copy. */
type LinkRewrite = (
  /** The matched text followed by its captured groups. */
  match: readonly string[],
  context: LinkRewriteContext,
) => string | null

type ResourceLinkPattern = {
  /** The tool the link points at (the `idMaps` key it is resolved by). */
  kind:
    | "magicLink"
    | "dynamicImage"
    | "poll"
    | "miniApp"
    | "minigame"
    | "leaderboard"
  /** Global regex; the match is the part of the text that changes. */
  match: RegExp
  /**
   * Set when the link carries just the tool id (capture 1) and the tool is a
   * hard dependency of the text that links to it; see `collectResourceLinkDependencies`.
   */
  dependencyCategory?:
    | "dynamicImages"
    | "minigames"
    | "miniApps"
    | "leaderboards"
  /** True when a match that resolves to nothing is a link to a tool that did not come along, so it is reported. */
  reportsUnresolved: boolean
  rewrite: LinkRewrite
}

/** Bounds what one scan of copied text may turn into dependencies or `IN` list values. */
export const MAX_LINKED_VALUES = 500

const NAME_PATH = "(?:[a-zA-Z0-9._-]+/)*[a-zA-Z0-9._-]+"

/**
 * How each link is recognised, defined once and shared by the rewrite, the
 * synchronous dependency scan below and the database-backed scan in
 * `link-dependencies.ts`. Captures: magic link `(workspaceId, name)`, poll link
 * `(workspaceId, pollId)`, poll payload `(base62 pollId)`, the rest `(id)`.
 */
export const MAGIC_LINK_PATTERN = new RegExp(`/r/(\\d+)/(${NAME_PATH})`, "g")
export const POLL_LINK_PATTERN = /\/l\/(\d+)\/p\/(\d+)/g
export const POLL_PAYLOAD_PATTERN = /\bpl_([0-9A-Za-z]+)/g
const DYNAMIC_IMAGE_LINK_PATTERN = /dynamic-images\?dynamicImageId=(\d+)/g
const MINIGAME_LINK_PATTERN = /minigames\?minigameId=(\d+)/g
const MINI_APP_LINK_PATTERN = /mini-apps\?id=(\d+)/g
const LEADERBOARD_LINK_PATTERN = /leaderboards\?leaderboardId=(\d+)/g

/**
 * Links a flow, keyword, trigger or other copied text can hold that carry a
 * workspace or a tool id. Only the id/workspace part is replaced: the origin,
 * the token parameters (`token={{minigame_play_token}}`) and the fragment stay
 * exactly as the author typed them. A new tool whose public link carries an id
 * adds ONE entry here (see the `flow-step-development` skill).
 */
export const RESOURCE_LINK_PATTERNS: readonly ResourceLinkPattern[] = [
  {
    // `<origin>/r/<workspaceId>/<name>`: a magic link, served by name.
    kind: "magicLink",
    match: MAGIC_LINK_PATTERN,
    reportsUnresolved: true,
    rewrite: ([whole, workspaceId, name], context) => {
      if (workspaceId !== context.sourceWorkspaceId) {
        return whole
      }
      const target = context.magicLinkNameBindings.get(name)
      return target === undefined
        ? null
        : `/r/${context.targetWorkspaceId}/${target}`
    },
  },
  {
    // `<origin>/dynamic-images?dynamicImageId=<id>&userId={{user_id}}`.
    kind: "dynamicImage",
    match: DYNAMIC_IMAGE_LINK_PATTERN,
    dependencyCategory: "dynamicImages",
    reportsUnresolved: true,
    rewrite: ([, imageId], context) => {
      const target = context.idMaps.dynamicImage?.get(imageId)
      return target === undefined
        ? null
        : `dynamic-images?dynamicImageId=${target}`
    },
  },
  {
    // `<origin>/l/<workspaceId>/p/<pollId>`: the omnichannel poll link.
    kind: "poll",
    match: POLL_LINK_PATTERN,
    reportsUnresolved: true,
    rewrite: ([whole, workspaceId, pollId], context) => {
      if (workspaceId !== context.sourceWorkspaceId) {
        return whole
      }
      const target = context.idMaps.poll?.get(pollId)
      return target === undefined
        ? null
        : `/l/${context.targetWorkspaceId}/p/${target}`
    },
  },
  {
    // `<origin>/minigames?minigameId=<id>&token={{minigame_play_token}}`.
    kind: "minigame",
    match: MINIGAME_LINK_PATTERN,
    dependencyCategory: "minigames",
    reportsUnresolved: true,
    rewrite: ([, id], context) => {
      const target = context.idMaps.minigame?.get(id)
      return target === undefined ? null : `minigames?minigameId=${target}`
    },
  },
  {
    // `<origin>/mini-apps?id=<id>&token={{mini_app_token}}`.
    kind: "miniApp",
    match: MINI_APP_LINK_PATTERN,
    dependencyCategory: "miniApps",
    reportsUnresolved: true,
    rewrite: ([, id], context) => {
      const target = context.idMaps.miniApp?.get(id)
      return target === undefined ? null : `mini-apps?id=${target}`
    },
  },
  {
    // `<origin>/leaderboards?leaderboardId=<id>&token={{leaderboard_view_token}}`.
    kind: "leaderboard",
    match: LEADERBOARD_LINK_PATTERN,
    dependencyCategory: "leaderboards",
    reportsUnresolved: true,
    rewrite: ([, id], context) => {
      const target = context.idMaps.leaderboard?.get(id)
      return target === undefined
        ? null
        : `leaderboards?leaderboardId=${target}`
    },
  },
  {
    // `pl_<base62 pollId>`: the payload of a poll deep link on a channel.
    kind: "poll",
    match: POLL_PAYLOAD_PATTERN,
    // Not reported: text that merely looks like the payload is not a link.
    reportsUnresolved: false,
    rewrite: ([whole, encoded], context) => {
      const target = context.idMaps.poll?.get(decodeBase62(encoded))
      return target === undefined ? whole : `pl_${encodeBase62(target)}`
    },
  },
]

/** A link that names a tool of the source workspace this install did not copy. */
export type UnresolvedResourceLink = { kind: string; link: string }

/**
 * Rewrites the resource links in every string of `value`. A link whose tool
 * this install copied is rewritten; one whose tool did not come along is left
 * as written and handed to `onUnresolved` so the installer is told.
 */
export const rewriteResourceLinksDeep = <T>(
  value: T,
  context: LinkRewriteContext,
  onUnresolved?: (link: UnresolvedResourceLink) => void,
): T =>
  mapStringLeaves(value, (text) =>
    RESOURCE_LINK_PATTERNS.reduce(
      (current, pattern) =>
        current.replace(pattern.match, (...args: string[]) => {
          // The trailing two replacer arguments are the offset and the input.
          const match = args.slice(0, -2)
          const [link = ""] = match
          const rewritten = pattern.rewrite(match, context)
          if (rewritten === null) {
            if (pattern.reportsUnresolved) {
              onUnresolved?.({ kind: pattern.kind, link })
            }
            return link
          }
          return rewritten
        }),
      text,
    ),
  )

/**
 * `rewriteResourceLinksDeep` over the entries of one category, as the install
 * runs it before the adapter inserts them. Warns (`linkNotRemapped`, pathed
 * under the entry) for a link to a tool the install did not copy. A no-op when
 * the source workspace is unknown, since then no link can be told to be ours.
 */
export const rewriteEntryResourceLinks = <E extends { sourceId: string }>(
  ctx: TemplateInstallContext,
  category: TemplateCategory,
  entries: readonly E[],
): E[] => {
  const { sourceWorkspaceId } = ctx
  if (!sourceWorkspaceId) {
    return [...entries]
  }
  const context: LinkRewriteContext = {
    sourceWorkspaceId,
    targetWorkspaceId: ctx.workspaceId,
    idMaps: ctx.idMaps,
    magicLinkNameBindings: ctx.magicLinkNameBindings ?? new Map(),
  }
  return entries.map((entry) =>
    rewriteResourceLinksDeep(entry, context, ({ kind, link }) =>
      ctx.warn({
        category,
        entityKind: "linkNotRemapped",
        path: `${category}.${entry.sourceId}`,
        value: `${kind}: ${link}`,
      }),
    ),
  )
}

/**
 * The tools a copied text links to by id, as hard dependencies of its owner: a
 * flow that sends a dynamic-image link is useless without it. Polls and magic
 * links are workspace-scoped and resolved against the database, see
 * `collectLinkedToolDependencies`.
 */
export const collectResourceLinkDependencies = (
  value: unknown,
): TemplateHardDependency[] => {
  const found = new Map<string, TemplateHardDependency>()
  mapStringLeaves(value, (text) => {
    for (const {
      dependencyCategory: category,
      match,
    } of RESOURCE_LINK_PATTERNS) {
      if (!category) {
        continue
      }
      for (const [, sourceId] of text.matchAll(match)) {
        // An id past the bigint range would abort the lookup it is passed to.
        if (found.size >= MAX_LINKED_VALUES) {
          return text
        }
        if (isBigintId(sourceId)) {
          found.set(`${category}:${sourceId}`, { category, sourceId })
        }
      }
    }
    return text
  })
  return [...found.values()]
}
