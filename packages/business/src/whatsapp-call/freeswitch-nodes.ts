import { z } from "zod"

/** Per-node connection info a workspace's browser/responder needs (`FS_NODES`). */
export const freeswitchNodeSchema = z.object({
  sipDomain: z.string().min(1),
  wssUrl: z.string().min(1),
  turnUrl: z.string().min(1),
  /**
   * Per-node xml_curl Basic credentials (node-secret isolation):
   * the responder only serves a node's gateways/directory to the caller that
   * presents THAT node's credentials. Optional for single-node deployments
   * (they fall back to `FS_XML_BASIC_USER/PASS`); required for every node
   * once `FS_NODES` lists more than one.
   */
  xmlBasicUser: z.string().min(1).optional(),
  xmlBasicPass: z.string().min(1).optional(),
})

export type FreeswitchXmlCredentials = { user: string; pass: string }

export class FreeswitchNodeCredentialsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FreeswitchNodeCredentialsError"
  }
}

/**
 * The xml_curl credentials the responder must see for `nodeId`. Multi-node
 * deployments MUST give every node its own pair, otherwise one node's
 * shared secret would unlock every other node's SIP passwords.
 */
export const resolveFreeswitchNodeXmlCredentials = (
  nodes: FreeswitchNodes,
  nodeId: string,
  fallback: Partial<FreeswitchXmlCredentials>,
): FreeswitchXmlCredentials | null => {
  const node = nodes[nodeId]
  if (!node) {
    return null
  }
  if (node.xmlBasicUser && node.xmlBasicPass) {
    return { user: node.xmlBasicUser, pass: node.xmlBasicPass }
  }
  if (Object.keys(nodes).length > 1) {
    throw new FreeswitchNodeCredentialsError(
      `freeswitch-node-credentials-missing: node "${nodeId}" must define xmlBasicUser/xmlBasicPass in FS_NODES when more than one node is configured`,
    )
  }
  if (fallback.user && fallback.pass) {
    return { user: fallback.user, pass: fallback.pass }
  }
  return null
}
export type FreeswitchNode = z.infer<typeof freeswitchNodeSchema>

export const freeswitchNodesSchema = z.record(z.string(), freeswitchNodeSchema)
export type FreeswitchNodes = z.infer<typeof freeswitchNodesSchema>

/** The single-node deployment's node id (N=1: a single `default` node). */
export const DEFAULT_FREESWITCH_NODE_ID = "default"

/**
 * Parses the `FS_NODES` env JSON into `{ nodeId: FreeswitchNode }`. When
 * unset (N=1 deployments), falls back to a single `"default"` node built
 * from the existing `FS_*` vars — so single-node deployments never need to
 * set `FS_NODES` at all.
 */
export const parseFreeswitchNodes = (
  json: string | undefined,
  fallback: FreeswitchNode,
): FreeswitchNodes => {
  if (!json) {
    return { [DEFAULT_FREESWITCH_NODE_ID]: fallback }
  }
  const parsed: unknown = JSON.parse(json)
  return freeswitchNodesSchema.parse(parsed)
}

/** Thrown by {@link resolveFreeswitchNode} for an id absent from `FS_NODES`. */
export class UnknownFreeswitchNodeError extends Error {
  constructor(nodeId: string) {
    super(`unknown-freeswitch-node: no FS_NODES entry for "${nodeId}"`)
    this.name = "UnknownFreeswitchNodeError"
  }
}

/** Resolves one node's config, or throws {@link UnknownFreeswitchNodeError}. */
export const resolveFreeswitchNode = (
  nodes: FreeswitchNodes,
  nodeId: string,
): FreeswitchNode => {
  const node = nodes[nodeId]
  if (!node) {
    throw new UnknownFreeswitchNodeError(nodeId)
  }
  return node
}
