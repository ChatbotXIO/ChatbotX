import {
  type FreeswitchNodes,
  parseFreeswitchNodes,
} from "@chatbotx.io/business"
import { env } from "@/env"

/**
 * The FreeSWITCH nodes this deployment knows about, parsed once per call
 * from server env (never from client input) — `FS_NODES` for a multi-node
 * deployment, else the single `"default"` node built from the scalar
 * `FS_*`/`TURN_*` vars.
 */
export const resolveFreeswitchNodes = (): FreeswitchNodes =>
  parseFreeswitchNodes(env.FS_NODES, {
    sipDomain: env.FS_SIP_DOMAIN ?? "",
    wssUrl: env.FS_WSS_URL ?? "",
    turnUrl: env.TURN_URL ?? "",
  })

/** The node ids this deployment can pin a workspace to (see `resolveFreeswitchNodes`). */
export const resolveFreeswitchNodeIds = (): string[] =>
  Object.keys(resolveFreeswitchNodes())
