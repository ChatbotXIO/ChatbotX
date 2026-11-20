import { db } from "@chatbotx.io/database/client"
import { isBigintId } from "@chatbotx.io/database/utils"
import { mapStringLeaves } from "@chatbotx.io/flow-config"
import { decodeBase62 } from "@chatbotx.io/utils"
import type { TemplateHardDependency } from "./adapters/types"
import {
  MAGIC_LINK_PATTERN,
  MAX_LINKED_VALUES,
  POLL_LINK_PATTERN,
  POLL_PAYLOAD_PATTERN,
} from "./resource-links"

const decodePollPayload = (encoded: string): string | null => {
  try {
    const id = decodeBase62(encoded)
    return isBigintId(id) ? id : null
  } catch {
    return null
  }
}

/**
 * The magic links (addressed by NAME) and polls (by id, or the `pl_` deep-link
 * payload) of the SOURCE workspace that `value` links to, as hard dependencies
 * of its owner. The id-based tool links are collected synchronously by
 * `collectResourceLinkDependencies`; these two need the database: a magic-link
 * name is resolved to its row, and a poll id or payload is kept only when the
 * poll exists in the workspace, so text that merely looks like a link pulls
 * nothing. A link carrying another workspace's id never counts. One query per
 * kind, however many links there are.
 */
export const collectLinkedToolDependencies = async (
  workspaceId: string,
  value: unknown,
): Promise<TemplateHardDependency[]> => {
  const magicNames = new Set<string>()
  const pollIds = new Set<string>()
  mapStringLeaves(value, (text) => {
    for (const [, linkWorkspaceId, name] of text.matchAll(MAGIC_LINK_PATTERN)) {
      if (linkWorkspaceId === workspaceId) {
        magicNames.add(name)
      }
    }
    for (const [, linkWorkspaceId, pollId] of text.matchAll(
      POLL_LINK_PATTERN,
    )) {
      if (linkWorkspaceId === workspaceId && isBigintId(pollId)) {
        pollIds.add(pollId)
      }
    }
    for (const [, encoded] of text.matchAll(POLL_PAYLOAD_PATTERN)) {
      const pollId = decodePollPayload(encoded)
      if (pollId) {
        pollIds.add(pollId)
      }
    }
    return text
  })
  const [magicLinks, polls] = await Promise.all([
    magicNames.size === 0
      ? []
      : db.query.magicLinkModel.findMany({
          where: {
            workspaceId,
            name: { in: [...magicNames].slice(0, MAX_LINKED_VALUES) },
          },
          columns: { id: true },
        }),
    pollIds.size === 0
      ? []
      : db.query.pollModel.findMany({
          where: {
            workspaceId,
            id: { in: [...pollIds].slice(0, MAX_LINKED_VALUES) },
          },
          columns: { id: true },
        }),
  ])
  return [
    ...magicLinks.map(({ id }) => ({
      category: "magicLinks" as const,
      sourceId: id,
    })),
    ...polls.map(({ id }) => ({ category: "polls" as const, sourceId: id })),
  ]
}
