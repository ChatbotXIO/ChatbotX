"use server"

import {
  integrationMetaCatalogService,
  metaCatalogOperationService,
  metaCatalogSyncRunService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { metaCatalogSyncScopes } from "@chatbotx.io/database/partials"
import {
  createCatalog,
  generateCatalogAuthUrl,
  getCatalog,
  listBusinesses,
} from "@chatbotx.io/integration-meta-catalog"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"
import { toSafeMetaCatalogConnection } from "../lib/meta-catalog-connection"

export const connectMetaCatalogAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ ctx, bindArgsParsedInputs: [workspaceId] }) => {
    const credential = await platformCredentialService.resolveForOwner({
      ownerId: await resolveOwnerForWorkspace(ctx.workspace),
      type: "messenger",
    })
    if (!credential) {
      const t = await getTranslations("metaCatalog.errors")
      throw new ChatbotXException(t("invalidAppSettings"))
    }
    const redirectUrl = buildBrokerCallbackUrl(
      "/integrations/messenger/callback",
    )
    const baseUrl = await getOriginUrlFromHeader()
    const referer = new URL(
      `/space/${workspaceId}/products`,
      baseUrl,
    ).toString()
    return redirect(
      generateCatalogAuthUrl({
        clientId: credential.config.clientId,
        version: credential.config.version,
        redirectUrl,
        stateParams: {
          workspaceId,
          referer,
          flow: "metaCatalog",
        },
      }),
    )
  })

export const getMetaCatalogStateAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId] }) => {
    const connection =
      await integrationMetaCatalogService.findByWorkspaceId(workspaceId)
    const history = await metaCatalogSyncRunService.list(workspaceId)
    return {
      connection: toSafeMetaCatalogConnection(connection),
      history,
    }
  })

const selectCatalogRequest = z.object({
  catalogId: z.string().trim().regex(/^\d+$/),
})

/**
 * A workspace may only have one active run, and now that pulls are recorded too
 * either direction can be the one that collides. The service names the collision
 * with a code because it has no request locale; the action is where it becomes a
 * sentence the workspace can read.
 */
const translateSyncCollision = async <Result>(
  operation: () => Promise<Result>,
): Promise<Result> => {
  try {
    return await operation()
  } catch (error) {
    if (
      error instanceof ChatbotXException &&
      error.code === "metaCatalogSyncAlreadyRunning"
    ) {
      const t = await getTranslations("metaCatalog.errors")
      throw new ChatbotXException(t("alreadyRunning"), error.code)
    }
    throw error
  }
}

export const selectMetaCatalogAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(selectCatalogRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const connection =
      await integrationMetaCatalogService.findByWorkspaceIdOrFail(workspaceId)
    const auth = await integrationMetaCatalogService.resolveAuth(connection.id)
    const catalog = await getCatalog(
      auth.accessToken,
      parsedInput.catalogId,
      auth.version,
    )
    // Created before the job is queued so the pull shows up in history the
    // moment it is requested, the same way a push does. A pull covers whatever
    // Meta happens to hold, so its scope is always "all".
    const { connection: selected, run } = await translateSyncCollision(() =>
      metaCatalogOperationService.startImport({
        workspaceId,
        catalogId: catalog.id,
        catalogName: catalog.name,
        businessId: catalog.businessId,
      }),
    )
    try {
      await defaultQueue.add(
        DefaultJobAction.importMetaCatalogProducts,
        {
          type: DefaultJobAction.importMetaCatalogProducts,
          data: {
            workspaceId,
            integrationMetaCatalogId: selected.id,
            runId: run.id,
          },
        },
        {
          jobId: `mc-import-${selected.id}-${selected.updatedAt.getTime()}`,
        },
      )
    } catch (error) {
      // Persisted for the workspace to read in history, so it is written in
      // their locale rather than the server's default.
      const t = await getTranslations("metaCatalog.errors")
      const reason = t("queueImport")
      await Promise.all([
        integrationMetaCatalogService.failImport(selected.id, reason),
        // Otherwise the run stays queued forever and, because only one run per
        // workspace may be active, blocks every later sync and import.
        metaCatalogSyncRunService.fail(run.id, reason),
      ])
      throw error
    }
    return selected
  })

/**
 * Everything the "create a catalog" panel needs, in one roundtrip: the Business
 * Managers the token can create under, plus a default name. The name comes from
 * the workspace, which is only known server-side — returning it here avoids
 * threading it through the products table as a prop.
 */
export const listMetaCatalogBusinessesAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ ctx, bindArgsParsedInputs: [workspaceId] }) => {
    const connection =
      await integrationMetaCatalogService.findByWorkspaceIdOrFail(workspaceId)
    const auth = await integrationMetaCatalogService.resolveAuth(connection.id)
    return {
      businesses: await listBusinesses(auth.accessToken, auth.version),
      suggestedName: ctx.workspace.name,
    }
  })

const createCatalogRequest = z.object({
  businessId: z.string().trim().regex(/^\d+$/),
  name: z.string().trim().min(1).max(100),
})

export const createMetaCatalogAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createCatalogRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const connection =
      await integrationMetaCatalogService.findByWorkspaceIdOrFail(workspaceId)
    const auth = await integrationMetaCatalogService.resolveAuth(connection.id)
    const catalog = await createCatalog({
      accessToken: auth.accessToken,
      businessId: parsedInput.businessId,
      name: parsedInput.name,
      version: auth.version,
    })
    // Bound, not "selected": a catalog Meta just created is empty, so kicking
    // off an import would only queue a job that finds nothing.
    return await integrationMetaCatalogService.bindCatalog({
      workspaceId,
      catalogId: catalog.id,
      catalogName: catalog.name,
      businessId: catalog.businessId,
    })
  })

const syncRequest = z.object({
  scope: metaCatalogSyncScopes,
  /** Destination catalog. Rebinds the connection when it differs from the stored one. */
  catalogId: z.string().trim().regex(/^\d+$/),
  categoryId: zodBigintAsString().optional(),
  selectedProductIds: z.array(zodBigintAsString()).max(1000).optional(),
})

type SyncRequest = z.infer<typeof syncRequest>

const SYNC_SCOPE_VALIDATORS = {
  all: () => true,
  category: (input: SyncRequest) => Boolean(input.categoryId),
  selected: (input: SyncRequest) => Boolean(input.selectedProductIds?.length),
} as const satisfies Record<
  SyncRequest["scope"],
  (input: SyncRequest) => boolean
>

const isSyncScopeComplete = (input: SyncRequest): boolean =>
  SYNC_SCOPE_VALIDATORS[input.scope](input)

export const syncToMetaCatalogAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(syncRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    if (!isSyncScopeComplete(parsedInput)) {
      const t = await getTranslations("metaCatalog.errors")
      throw new ChatbotXException(t("emptyScope"))
    }
    const connection =
      await integrationMetaCatalogService.findByWorkspaceIdOrFail(workspaceId)
    const { catalogId, ...runInput } = parsedInput
    // Currency and product URL now live on each product, so the destination
    // catalog is the only connection-level prerequisite left. Verify it against
    // Graph only when it changes — a re-typed identical id costs no roundtrip.
    let catalogName: string | undefined
    let businessId: string | undefined
    if (catalogId !== connection.catalogId) {
      const auth = await integrationMetaCatalogService.resolveAuth(
        connection.id,
      )
      const catalog = await getCatalog(
        auth.accessToken,
        catalogId,
        auth.version,
      )
      catalogName = catalog.name
      businessId = catalog.businessId
    }
    const run = await translateSyncCollision(() =>
      metaCatalogOperationService.startPush({
        workspaceId,
        catalogId,
        catalogName,
        businessId,
        ...runInput,
      }),
    )
    try {
      await defaultQueue.add(
        DefaultJobAction.submitMetaCatalogSync,
        {
          type: DefaultJobAction.submitMetaCatalogSync,
          data: { workspaceId, runId: run.id },
        },
        { jobId: `mc-submit-${run.id}` },
      )
    } catch (error) {
      const t = await getTranslations("metaCatalog.errors")
      await metaCatalogSyncRunService.fail(run.id, t("queueSync"))
      throw error
    }
    return run
  })

export const disconnectMetaCatalogAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId] }) => {
    await integrationMetaCatalogService.disconnect(workspaceId)
  })
