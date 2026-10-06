import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { dispatchAuditRecordSafely } from "@chatbotx.io/business/audit"
import { connectionStateService } from "@chatbotx.io/business/connection"
import {
  type AiKeyProvider,
  verifyAiProviderApiKey,
} from "@chatbotx.io/business/integration-ai-provider/verify"
import { connectionService } from "@chatbotx.io/connections"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors, type ValidationErrors } from "next-safe-action"
import { normalizeError } from "universal-error-normalizer"
import type { z } from "zod"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { logger } from "@/lib/log"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"

interface DisconnectService {
  disconnect(workspaceId: string): Promise<void>
}

interface CreateDisconnectActionOptions {
  /** Optional side effect after a successful disconnect (e.g. AI cache invalidation). */
  afterDisconnect?: (workspaceId: string) => Promise<void>
  /** When true (default) failures are logged via `logger.error` then rethrown. */
  log?: boolean
  /** Human-readable integration name for the error log, e.g. "ActiveCampaign". */
  name: string
  /**
   * The `Connection` registry key for this integration — workspace-level
   * integrations are singletons (`sourceId = "workspace"`). When a
   * `Connection` row exists for `(workspaceId, provider, "workspace")` the
   * disconnect routes through `connectionService.disconnect` (provider-side
   * teardown + store-binding delete + FSM transition); otherwise (a
   * workspace predating the Phase 1 backfill) it falls back to `service`'s
   * own `disconnect`, so this never regresses a not-yet-backfilled
   * workspace's ability to disconnect.
   */
  provider: IntegrationType
}

/**
 * The active, correct implementation for the 13 workspace-integration
 * disconnect actions — it routes through `connectionService` itself (see
 * `provider` above), so adopters do not need any further change.
 */
export function createDisconnectAction(
  service: DisconnectService,
  options: CreateDisconnectActionOptions,
) {
  const { name, log = true, afterDisconnect, provider } = options

  return workspaceActionClientAllowExpired
    .bindArgsSchemas(workspaceIdrequestParams)
    .action(
      async ({
        bindArgsParsedInputs: [workspaceId],
      }: {
        bindArgsParsedInputs: WorkspaceIdRequestParams
      }) => {
        try {
          const connection =
            await connectionStateService.findByProviderSourceId({
              workspaceId,
              provider,
              sourceId: "workspace",
            })
          if (connection) {
            await connectionService.disconnect({
              connectionId: connection.id,
              workspaceId,
            })
            // The legacy `service.disconnect(workspaceId)` fallback below
            // already audits internally via `BaseService.audit()`;
            // `connectionService.disconnect` (the engine path) doesn't, so
            // this is the one place that has to — otherwise a backfilled
            // workspace's disconnect silently drops its audit trail.
            await dispatchAuditRecordSafely(
              {
                action: "disconnect",
                detail: `disconnected the ${name} integration (#${connection.id})`,
              },
              `Failed to audit ${name} disconnect`,
            )
          } else {
            await service.disconnect(workspaceId)
          }
        } catch (error) {
          if (log) {
            logger.error(
              { err: normalizeError(error), workspaceId },
              `Failed to disconnect ${name}`,
            )
          }
          throw error
        }
        // Isolated from the disconnect's own try/catch above: a post-
        // teardown side effect (e.g. AI cache invalidation) failing must
        // never report an already-successful disconnect as failed.
        try {
          await afterDisconnect?.(workspaceId)
        } catch (error) {
          logger.error(
            { err: normalizeError(error), workspaceId },
            `${name} disconnected, but its afterDisconnect hook failed`,
          )
        }
      },
    )
}

/** The workspace-singleton credential-strategy integrations `createCredentialConnectAction` builds. */
type CredentialConnectProvider =
  | "activeCampaign"
  | "drip"
  | "getResponse"
  | "klaviyo"
  | "mailchimp"
  | "mailerLite"
  | "moosend"
  | "sendGrid"

interface CreateCredentialConnectActionOptions<
  TSchema extends z.ZodType<Record<string, unknown>>,
> {
  /** Human-readable integration name for the error log, e.g. "ActiveCampaign". */
  name: string
  /**
   * The `Connection` registry key for this integration — see
   * `createDisconnectAction`'s `provider` doc for the full contract.
   */
  provider: CredentialConnectProvider
  /** Validates the raw connect payload before it's persisted as `config`. */
  schema: TSchema
}

/**
 * Factory for the credential-strategy workspace integrations (SendGrid,
 * Moosend, Drip, Klaviyo, Mailchimp, MailerLite, ActiveCampaign,
 * GetResponse) whose connect action is nothing but "validate the schema,
 * then persist it" — no live verification, no post-connect side effect.
 *
 * Every call passes `allowUpdate: true`: these integrations are workspace
 * singletons, so a repeat connect always replaces the previously stored
 * credentials rather than rejecting as an already-connected error — the
 * same upsert semantics their legacy `integration<Name>Service.upsert`
 * methods had before the Connection engine replaced them.
 */
export function createCredentialConnectAction<
  TSchema extends z.ZodType<Record<string, unknown>>,
>(options: CreateCredentialConnectActionOptions<TSchema>) {
  const { name, provider, schema } = options

  return workspaceActionClient
    .bindArgsSchemas(workspaceIdrequestParams)
    .inputSchema(schema)
    .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
      try {
        await connectionService.connectFromCredentials({
          workspaceId,
          provider,
          config: parsedInput,
          allowUpdate: true,
        })
      } catch (error) {
        logger.error(
          { err: normalizeError(error), workspaceId },
          `Failed to connect ${name}`,
        )
        throw error
      }
    })
}

/** The shared config shape every AI-key provider's schema parses down to. */
interface AiKeyConnectConfig {
  apiKey: string
  maxOutputTokens: number
  model: string
  temperature: number
}

interface CreateAiKeyConnectActionOptions<
  TSchema extends z.ZodType<AiKeyConnectConfig>,
> {
  /** The AI provider key, both the `Connection` registry key and the `verifyAiProviderApiKey` probe to use. */
  provider: AiKeyProvider
  /** Validates the raw connect payload; also the schema `returnValidationErrors` reports an invalid key against. */
  schema: TSchema
}

/**
 * Factory for the AI-provider workspace integrations (Claude, OpenAI,
 * Gemini, DeepSeek, OpenRouter) that store a verified API key plus model
 * config: verifies the key live via `verifyAiProviderApiKey` before
 * persisting anything, connects through the Connection engine, then
 * invalidates the AI integration cache so the next completion call picks
 * up the new credentials. `openaiCompatible` is NOT built from this
 * factory — it allows multiple connections per workspace (one per
 * `baseURL`) and verifies through a provider-probe call instead of
 * `verifyAiProviderApiKey`, so it stays bespoke.
 *
 * Every call passes `allowUpdate: true` — same workspace-singleton upsert
 * contract as `createCredentialConnectAction` above.
 */
export function createAiKeyConnectAction<
  TSchema extends z.ZodType<AiKeyConnectConfig>,
>(options: CreateAiKeyConnectActionOptions<TSchema>) {
  const { provider, schema } = options

  return workspaceActionClient
    .bindArgsSchemas(workspaceIdrequestParams)
    .inputSchema(schema)
    .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
      const t = await getTranslations()

      if (
        (await verifyAiProviderApiKey(provider, parsedInput.apiKey)) ===
        "invalid"
      ) {
        // `Schema`/`AS` in `returnValidationErrors`'s own signature default
        // to the generic `TSchema` here unresolved — TS can't verify a
        // literal against a mapped type over a still-abstract generic
        // parameter, even though `TSchema`'s `AiKeyConnectConfig` bound
        // guarantees `apiKey` exists on every concrete instantiation.
        return returnValidationErrors(schema, {
          apiKey: { _errors: [t("validation.invalidApiKey")] },
        } as ValidationErrors<TSchema>)
      }

      await connectionService.connectFromCredentials({
        workspaceId,
        provider,
        config: {
          apiKey: parsedInput.apiKey,
          model: parsedInput.model,
          temperature: parsedInput.temperature,
          maxOutputTokens: parsedInput.maxOutputTokens,
        },
        allowUpdate: true,
      })

      await aiIntegrationService.invalidateCache(workspaceId, provider)

      return
    })
}
