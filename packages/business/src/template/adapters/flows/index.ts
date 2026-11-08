import type { TemplateFlowEntry } from "@chatbotx.io/flow-config"
import { omitKeys } from "../../fingerprint"
import type { ResourceAdapter } from "../types"
import { flowSyncHandler } from "./backup"
import { flowCollector } from "./collect"
import { insertFlows } from "./install"
import {
  FLOW_ALL_KINDS,
  FLOW_DEFERRED_KINDS,
  FLOW_INSTALLER_OWNED_FIELDS,
} from "./kinds"

/**
 * Flows adapter — reuses `flowService.createFromImport` verbatim, exactly as
 * single-flow import does. Its safety property (node ids reused as-is is
 * safe because every nodeId-keyed table also scopes by a freshly-minted
 * flowId) holds identically here, so there is zero new flow-insert code.
 *
 * Flows insert after every other Phase-1 category because every flow -> X
 * reference is either a manifest kind (already resolved in Phase R) or a
 * nullable/jsonb soft reference — never a NOT NULL FK — so a flow can always
 * be inserted even when some of its own references (to categories inserted
 * later in Phase 1, or to other flows in this same template) are not yet
 * resolvable.
 *
 * `flow`/`flowNode` are the two *deferred* kinds: a flow may reference
 * another flow that is also part of this template but has not been created
 * yet at the point this flow inserts. Since node ids are reused verbatim,
 * the `flowNode` idMap is the identity map once every referenced flow
 * exists. The returned `PatchTask` re-runs the remap restricted to
 * the deferred kinds against every flow's *own* draft version, once all
 * flows in this install have a target id — then writes the result straight
 * onto the draft row (a flow installed live has its published
 * version patched identically).
 */
export const flowsAdapter: ResourceAdapter<TemplateFlowEntry> = {
  category: "flows",
  providesKinds: ["flow"],
  consumesKinds: FLOW_ALL_KINDS,
  deferredKinds: FLOW_DEFERRED_KINDS,
  trackedKind: "flow",
  folderTypes: ["flow", "tag", "webhook", "emailTopic"],
  minFormatVersion: 1,
  fingerprint: {
    project: (entry) => omitKeys(entry, FLOW_INSTALLER_OWNED_FIELDS),
  },
  insert: insertFlows,
  sync: flowSyncHandler,
  collector: flowCollector,
}
