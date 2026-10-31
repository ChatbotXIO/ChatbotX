import { templateUninstallExecuteService } from "@chatbotx.io/business/template-uninstall/execute"
import type { Job } from "bullmq"
import { runLeasedTemplateJob } from "../../lib/run-leased-template-job"

type UninstallTemplateData = {
  installationId: string
  workspaceId: string
  attempt: number
}

const UNKNOWN_UNINSTALL_ERROR_CODE = "templateUninstallFailed"

/**
 * The installation row is the outbox: the handler claims it with a lease first, so a redelivered or swept job for a finished or in-flight
 * uninstall is a no-op. Every batch renews the lease, and the final
 * transition is fenced by the claim token.
 */
export async function uninstallTemplate(data: UninstallTemplateData, job: Job) {
  const claimed = await templateUninstallExecuteService.claim(data)
  if (!claimed) {
    return
  }
  const claim = { ...claimed, workspaceId: data.workspaceId }
  await runLeasedTemplateJob({
    job,
    failureMessage: "Template uninstall failed",
    logContext: data,
    unknownErrorCode: UNKNOWN_UNINSTALL_ERROR_CODE,
    run: () => templateUninstallExecuteService.run(claim),
    release: () => templateUninstallExecuteService.release(claim),
    fail: (errorCode) => templateUninstallExecuteService.fail(claim, errorCode),
  })
}

/** Blocked target owner: terminal `skipped`, so the sweep never re-finds it. */
export async function skipBlockedTemplateUninstall(
  data: UninstallTemplateData,
): Promise<void> {
  await templateUninstallExecuteService.skipBlocked(data.installationId)
}
