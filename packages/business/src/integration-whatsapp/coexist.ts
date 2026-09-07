import { SdkException } from "@chatbotx.io/sdk"
import { coexistService } from "../coexist/service"
import { logger } from "../logger"
import { whatsappAuthForCapiScopeSchema } from "./auth-schema"

/**
 * Meta's Coexistence sync must be triggered once per onboarding window, in
 * this order — state before history (per Meta's "Synchronizing WhatsApp
 * Business app data" doc).
 */
export const WHATSAPP_COEXIST_SYNC_TYPES = [
  "smb_app_state_sync",
  "history",
] as const
export type WhatsappCoexistSyncType =
  (typeof WHATSAPP_COEXIST_SYNC_TYPES)[number]

export type SetCoexistTriggerSyncResult =
  | { ok: true }
  | { ok: false; reason?: string }

export type SetCoexistTriggerSync = (input: {
  accessToken: string
  version?: string
  phoneNumberId: string
  syncType: WhatsappCoexistSyncType
}) => Promise<SetCoexistTriggerSyncResult>

export type SetCoexistInput = {
  workspaceId: string
  integrationId: string
  enabled: boolean
  aiReadsSyncedHistory?: boolean
  /** Primitives-only provider call — business does not depend on `@chatbotx.io/integration-whatsapp`. */
  triggerSync: SetCoexistTriggerSync
}

/** Why `setCoexist` failed — a caller/log reader no longer has to infer it from `reason`/`msg` alone. */
export const SET_COEXIST_FAILURE_CAUSES = {
  /** The integration row wasn't found (or isn't in this workspace). */
  notFound: "notFound",
  /** The stored `auth` failed schema validation. */
  invalidAuth: "invalidAuth",
  /** The provider's `triggerSync` returned `{ ok: false }`, with or without a `reason`. */
  triggerRejected: "triggerRejected",
  /** `triggerSync` threw. */
  triggerThrew: "triggerThrew",
} as const
export type SetCoexistFailureCause =
  (typeof SET_COEXIST_FAILURE_CAUSES)[keyof typeof SET_COEXIST_FAILURE_CAUSES]

export type SetCoexistResult =
  | { success: true }
  | {
      success: false
      cause: SetCoexistFailureCause
      reason?: string
      msg?: string
    }

/**
 * Enables or disables WhatsApp coexistence through the SHARED
 * `coexistService.enable/disable` and, on enable, asks Meta to push
 * Coexistence sync data twice (state, then history) via the injected
 * `triggerSync`.
 *
 * Going through the shared service is what gives WhatsApp the two behaviours it
 * was missing while re-implementing the flag flip itself: `enable` REUSES a run
 * still alive in `init | running | waiting` instead of opening a second one,
 * and `disable` tears every live run down. Both matter now that a WhatsApp run
 * parks in `waiting` for up to 24h — a run that outlived a disable was revived
 * by the scheduler on every history burst until it hit "Max scheduler retries
 * exceeded".
 *
 * The auth is validated BEFORE the enable write: `enable` would otherwise open
 * a run whose access token we cannot read, and the scheduler would retry it
 * until it terminalized.
 *
 * Keeps today's exact strings: a `{ ok:false, reason }` result marks the run
 * failed with `` `smb_app_data ${reason}` `` and returns
 * `{ success:false, cause:"triggerRejected", reason }`; a `{ ok:false }` with
 * no `reason` marks nothing and returns bare
 * `{ success:false, cause:"triggerRejected" }` (matches the original route's
 * conditional — never writes `"smb_app_data undefined"`). A thrown error marks
 * the run failed with `err.message` (or `"smb_app_data error"` for a non-`Error`
 * throw) and returns `cause:"triggerThrew"` with `reason: "trigger_failed"` and
 * `msg` set only for a thrown `SdkException`.
 */
export async function setCoexist(
  input: SetCoexistInput,
): Promise<SetCoexistResult> {
  const scope = {
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    channel: "whatsapp",
  } as const

  if (!input.enabled) {
    const disabled = await coexistService.disable(scope)
    return disabled.success
      ? { success: true }
      : { success: false, cause: SET_COEXIST_FAILURE_CAUSES.notFound }
  }

  const integration = await coexistService.findIntegrationForCoexist(scope)
  if (integration?.channel !== "whatsapp") {
    return { success: false, cause: SET_COEXIST_FAILURE_CAUSES.notFound }
  }

  const auth = whatsappAuthForCapiScopeSchema.safeParse(integration.auth)
  if (!auth.success) {
    return { success: false, cause: SET_COEXIST_FAILURE_CAUSES.invalidAuth }
  }

  const enabled = await coexistService.enable({
    ...scope,
    triggerSource: "popup-enable",
    // `undefined` would leave the column untouched; the popup's contract is
    // "enable writes the flag", so keep the previous `?? false` default.
    aiReadsSyncedHistory: input.aiReadsSyncedHistory ?? false,
  })
  if (!enabled.success) {
    return { success: false, cause: SET_COEXIST_FAILURE_CAUSES.notFound }
  }

  return triggerCoexistSync({
    runId: enabled.runId,
    integrationId: input.integrationId,
    phoneNumberId: integration.phoneNumberId,
    accessToken: auth.data.tokens.accessToken,
    version: auth.data.version,
    triggerSync: input.triggerSync,
  })
}

async function triggerCoexistSync(params: {
  runId: string
  integrationId: string
  phoneNumberId: string
  accessToken: string
  version?: string
  triggerSync: SetCoexistTriggerSync
}): Promise<SetCoexistResult> {
  const {
    runId,
    integrationId,
    phoneNumberId,
    accessToken,
    version,
    triggerSync,
  } = params

  try {
    // Sequential on purpose: Meta requires each sync type triggered in
    // order (state before history), not in parallel.
    for (const syncType of WHATSAPP_COEXIST_SYNC_TYPES) {
      const result = await triggerSync({
        accessToken,
        version,
        phoneNumberId,
        syncType,
      })

      if (result.ok) {
        continue
      }

      if (!result.reason) {
        // No reason to record — matches the original route's conditional:
        // nothing is written to the run, and the response carries no reason.
        return {
          success: false,
          cause: SET_COEXIST_FAILURE_CAUSES.triggerRejected,
        }
      }

      await coexistService.markFailed({
        runId,
        currentError: `smb_app_data ${result.reason}`,
      })
      return {
        success: false,
        cause: SET_COEXIST_FAILURE_CAUSES.triggerRejected,
        reason: result.reason,
      }
    }
  } catch (err) {
    logger.error({ err, integrationId }, "smb_app_data trigger failed")
    await coexistService.markFailed({
      runId,
      currentError: err instanceof Error ? err.message : "smb_app_data error",
    })
    return {
      success: false,
      cause: SET_COEXIST_FAILURE_CAUSES.triggerThrew,
      reason: "trigger_failed",
      msg: err instanceof SdkException ? err.message : undefined,
    }
  }

  return { success: true }
}
