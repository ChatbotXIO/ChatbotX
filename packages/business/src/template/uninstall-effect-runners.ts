import {
  mediaLibraryFileRepository,
  savedReplyImageRepository,
} from "@chatbotx.io/database/repositories"
import { removeTriggerCache } from "@chatbotx.io/events"
import { uploader } from "@chatbotx.io/filesystem"
import { aiAgentService } from "../ai-agent/service"
import { aiFileService } from "../ai-file/service"
import { automatedResponseService } from "../automated-response/service"
import { connectionStateService } from "../connection/state-service"
import { couponService } from "../coupon/service"
import { messengerWelcomeMessageFlowService } from "../messenger-welcome-message-flow/service"
import { pipelineService } from "../pipeline/service"
import { qrCodeService } from "../qr-code/qr-code.service"
import { workspaceService } from "../workspace"
import { savedReplyImageOwnedPrefixes } from "./template-object-keys"
import { registerUninstallEffect } from "./uninstall-effects"

const requireArg = (
  args: Record<string, string | null>,
  name: string,
): string => {
  const value = args[name]
  if (!value) {
    throw new Error(`Uninstall effect is missing "${name}"`)
  }
  return value
}

/**
 * The post-commit effects the delete adapters record. Each runner is
 * idempotent (cache drops, enqueue-with-deterministic-id, object delete of a
 * possibly missing key).
 */
registerUninstallEffect("automatedResponse.invalidateCache", (args) =>
  automatedResponseService.invalidateCache(requireArg(args, "workspaceId")),
)
registerUninstallEffect("trigger.invalidateCache", (args) =>
  removeTriggerCache(requireArg(args, "workspaceId")),
)
registerUninstallEffect("qrCode.invalidateCache", (args) =>
  qrCodeService.invalidateWorkspaceCache(requireArg(args, "workspaceId")),
)
registerUninstallEffect("aiAgent.invalidateCache", (args) =>
  aiAgentService.invalidateWorkspaceCache(requireArg(args, "workspaceId")),
)
registerUninstallEffect("coupon.invalidateCache", (args) =>
  couponService.invalidateWorkspaceCache(requireArg(args, "workspaceId")),
)
registerUninstallEffect("flow.welcomeCleanup", (args) =>
  messengerWelcomeMessageFlowService.enqueueDelete({
    workspaceId: requireArg(args, "workspaceId"),
    flowIds: [requireArg(args, "flowId")],
  }),
)
/**
 * The deleted webchat's inbox goes to `disconnected` and gives its channel
 * quota back. Repeating it is harmless: the connection state machine ignores
 * a connection that is already disconnected, and the legacy inbox path is a
 * plain update.
 */
registerUninstallEffect("webchat.disconnectInbox", async (args) => {
  const workspaceId = requireArg(args, "workspaceId")
  const workspace = await workspaceService.findById({ id: workspaceId })
  await connectionStateService.disconnectInbox({
    inboxId: requireArg(args, "inboxId"),
    ownerId: workspace.ownerId,
    workspaceId,
  })
})
registerUninstallEffect("aiFile.deleteObject", async (args) => {
  const path = args.path
  if (path) {
    await uploader.deleteObject(path)
  }
})
// The existing reindex claims the run (error -> queued) and enqueues it with
// a per-run job id; a second call while one is queued or running coalesces.
registerUninstallEffect("aiFile.reindex", async (args) => {
  await aiFileService.reindex({
    workspaceId: requireArg(args, "workspaceId"),
    id: requireArg(args, "aiFileId"),
  })
})
registerUninstallEffect("pipeline.afterStructureChange", (args) =>
  pipelineService.notifyStructureChanged(
    requireArg(args, "workspaceId"),
    requireArg(args, "pipelineId"),
  ),
)
/**
 * The media files a deleted saved reply's images copied. Only a file under
 * this installation's own prefix (including the `tpl-<id>:` prefixes older
 * syncs and installs staged under) is ever deleted (an older install, or
 * anything the installer uploaded or reused, is left alone), and only when no
 * other saved reply still shows it. A file already gone is done.
 */
registerUninstallEffect("savedReply.deleteImages", async (args) => {
  const workspaceId = requireArg(args, "workspaceId")
  const prefixes = savedReplyImageOwnedPrefixes(
    workspaceId,
    requireArg(args, "installationId"),
  )
  for (const id of requireArg(args, "fileIds").split(",")) {
    const file = await mediaLibraryFileRepository.findById({ id, workspaceId })
    if (!(file && prefixes.some((prefix) => file.path.startsWith(prefix)))) {
      continue
    }
    if ((await savedReplyImageRepository.countReferences(id)) > 0) {
      continue
    }
    await uploader.deleteObject(file.path)
    await mediaLibraryFileRepository.deleteById({ id, workspaceId })
  }
})
