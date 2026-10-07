import {
  integrationMetaCatalogService,
  metaCatalogOperationService,
  metaCatalogSyncRunService,
} from "@chatbotx.io/business"
import {
  ChatbotXException,
  validationException,
} from "@chatbotx.io/business/errors"
import type { MetaCatalogSyncScope } from "@chatbotx.io/database/partials"
import {
  createCatalog,
  getCatalog,
  listBusinesses,
} from "@chatbotx.io/integration-meta-catalog"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { toSafeMetaCatalogConnection } from "./meta-catalog-connection"

// The Meta Catalog operations behind both the builder actions and the public
// API. Authorization, and the locale of the sentences persisted in the sync
// history, stay with the caller (`MetaCatalogReasons`).

export type MetaCatalogReasons = {
  /** A run of the other direction is already active. */
  alreadyRunning: string
  /** Persisted as the failure reason when the import job cannot be queued. */
  queueImport: string
  /** Persisted as the failure reason when the sync job cannot be queued. */
  queueSync: string
}

export const ENGLISH_META_CATALOG_REASONS: MetaCatalogReasons = {
  alreadyRunning:
    "A catalog sync or import is already running for this workspace.",
  queueImport: "The import could not be queued. Try again.",
  queueSync: "The sync could not be queued. Try again.",
}

/**
 * A workspace may only have one active run; the service names the collision
 * with a code because it has no request locale.
 */
const translateSyncCollision = async <Result>(
  reasons: MetaCatalogReasons,
  operation: () => Promise<Result>,
): Promise<Result> => {
  try {
    return await operation()
  } catch (error) {
    if (
      error instanceof ChatbotXException &&
      error.code === "metaCatalogSyncAlreadyRunning"
    ) {
      throw new ChatbotXException(reasons.alreadyRunning, error.code, 409)
    }
    throw error
  }
}

/** The connection (minus its credential) and the sync history. */
export async function getMetaCatalogState(workspaceId: string) {
  const connection =
    await integrationMetaCatalogService.findByWorkspaceId(workspaceId)
  const history = await metaCatalogSyncRunService.list(workspaceId)
  return { connection: toSafeMetaCatalogConnection(connection), history }
}

/** Binds an existing Meta catalog and queues the import of its products. */
export async function selectMetaCatalog(input: {
  workspaceId: string
  catalogId: string
  reasons: MetaCatalogReasons
}) {
  const { workspaceId, reasons } = input
  const connection =
    await integrationMetaCatalogService.findByWorkspaceIdOrFail(workspaceId)
  const auth = await integrationMetaCatalogService.resolveAuth(connection.id)
  const catalog = await getCatalog(
    auth.accessToken,
    input.catalogId,
    auth.version,
  )
  // Created before the job is queued so the pull shows up in history the
  // moment it is requested. A pull covers whatever Meta holds: scope "all".
  const { connection: selected, run } = await translateSyncCollision(
    reasons,
    () =>
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
      { jobId: `mc-import-${selected.id}-${selected.updatedAt.getTime()}` },
    )
  } catch (error) {
    await Promise.all([
      integrationMetaCatalogService.failImport(
        selected.id,
        reasons.queueImport,
      ),
      // Otherwise the run stays queued forever and, because only one run per
      // workspace may be active, blocks every later sync and import.
      metaCatalogSyncRunService.fail(run.id, reasons.queueImport),
    ])
    throw error
  }
  return selected
}

/** Business Managers the connected token can create catalogs under. */
export async function listMetaCatalogBusinesses(workspaceId: string) {
  const connection =
    await integrationMetaCatalogService.findByWorkspaceIdOrFail(workspaceId)
  const auth = await integrationMetaCatalogService.resolveAuth(connection.id)
  return await listBusinesses(auth.accessToken, auth.version)
}

/**
 * Creates a catalog on Meta and binds it. Bound, not "selected": a catalog Meta
 * just created is empty, so an import would only queue a job that finds nothing.
 */
export async function createAndBindMetaCatalog(input: {
  workspaceId: string
  businessId: string
  name: string
}) {
  const connection =
    await integrationMetaCatalogService.findByWorkspaceIdOrFail(
      input.workspaceId,
    )
  const auth = await integrationMetaCatalogService.resolveAuth(connection.id)
  const catalog = await createCatalog({
    accessToken: auth.accessToken,
    businessId: input.businessId,
    name: input.name,
    version: auth.version,
  })
  return await integrationMetaCatalogService.bindCatalog({
    workspaceId: input.workspaceId,
    catalogId: catalog.id,
    catalogName: catalog.name,
    businessId: catalog.businessId,
  })
}

export type MetaCatalogSyncInput = {
  scope: MetaCatalogSyncScope
  /**
   * Destination catalog; rebinds the connection when it differs from the
   * stored one. Omitted: the catalog the connection is bound to.
   */
  catalogId?: string
  categoryId?: string
  selectedProductIds?: string[]
}

const SYNC_SCOPE_VALIDATORS = {
  all: () => true,
  category: (input: MetaCatalogSyncInput) => Boolean(input.categoryId),
  selected: (input: MetaCatalogSyncInput) =>
    Boolean(input.selectedProductIds?.length),
} as const satisfies Record<
  MetaCatalogSyncScope,
  (input: MetaCatalogSyncInput) => boolean
>

export const isMetaCatalogSyncScopeComplete = (
  input: MetaCatalogSyncInput,
): boolean => SYNC_SCOPE_VALIDATORS[input.scope](input)

/** Starts a push of products to the destination catalog and queues the submit job. */
export async function syncProductsToMetaCatalog(input: {
  workspaceId: string
  sync: MetaCatalogSyncInput
  reasons: MetaCatalogReasons
}) {
  const { workspaceId, reasons } = input
  const connection =
    await integrationMetaCatalogService.findByWorkspaceIdOrFail(workspaceId)
  const { catalogId: requestedCatalogId, ...runInput } = input.sync
  const catalogId = requestedCatalogId ?? connection.catalogId
  if (!catalogId) {
    throw validationException(
      "catalogId",
      "No catalog is bound yet: send catalogId",
    )
  }
  // The destination catalog is the only connection-level prerequisite left.
  // Verify it against Graph only when it changes.
  let catalogName: string | undefined
  let businessId: string | undefined
  if (catalogId !== connection.catalogId) {
    const auth = await integrationMetaCatalogService.resolveAuth(connection.id)
    const catalog = await getCatalog(auth.accessToken, catalogId, auth.version)
    catalogName = catalog.name
    businessId = catalog.businessId
  }
  const run = await translateSyncCollision(reasons, () =>
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
    await metaCatalogSyncRunService.fail(run.id, reasons.queueSync)
    throw error
  }
  return run
}
