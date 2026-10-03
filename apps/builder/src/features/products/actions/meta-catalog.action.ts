"use server"

import {
  integrationMetaCatalogService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { metaCatalogSyncScopes } from "@chatbotx.io/database/partials"
import { generateCatalogAuthUrl } from "@chatbotx.io/integration-meta-catalog"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"
import {
  createAndBindMetaCatalog,
  getMetaCatalogState,
  isMetaCatalogSyncScopeComplete,
  listMetaCatalogBusinesses,
  type MetaCatalogReasons,
  selectMetaCatalog,
  syncProductsToMetaCatalog,
} from "../lib/meta-catalog-operations"

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
    const redirectUrl = await buildProviderCallbackUrl(
      credential,
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
  .action(
    async ({ bindArgsParsedInputs: [workspaceId] }) =>
      await getMetaCatalogState(workspaceId),
  )

const selectCatalogRequest = z.object({
  catalogId: z.string().trim().regex(/^\d+$/),
})

/** The history sentences are persisted for the workspace, so they use its locale. */
const getReasons = async (): Promise<MetaCatalogReasons> => {
  const t = await getTranslations("metaCatalog.errors")
  return {
    alreadyRunning: t("alreadyRunning"),
    queueImport: t("queueImport"),
    queueSync: t("queueSync"),
  }
}

export const selectMetaCatalogAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(selectCatalogRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await selectMetaCatalog({
        workspaceId,
        catalogId: parsedInput.catalogId,
        reasons: await getReasons(),
      }),
  )

/**
 * Everything the "create a catalog" panel needs, in one roundtrip: the Business
 * Managers the token can create under, plus a default name. The name comes from
 * the workspace, which is only known server-side.
 */
export const listMetaCatalogBusinessesAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ ctx, bindArgsParsedInputs: [workspaceId] }) => ({
    businesses: await listMetaCatalogBusinesses(workspaceId),
    suggestedName: ctx.workspace.name,
  }))

const createCatalogRequest = z.object({
  businessId: z.string().trim().regex(/^\d+$/),
  name: z.string().trim().min(1).max(100),
})

export const createMetaCatalogAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createCatalogRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await createAndBindMetaCatalog({ workspaceId, ...parsedInput }),
  )

const syncRequest = z.object({
  scope: metaCatalogSyncScopes,
  /** Destination catalog. Rebinds the connection when it differs from the stored one. */
  catalogId: z.string().trim().regex(/^\d+$/),
  categoryId: zodBigintAsString().optional(),
  selectedProductIds: z.array(zodBigintAsString()).max(1000).optional(),
})

export const syncToMetaCatalogAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(syncRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    if (!isMetaCatalogSyncScopeComplete(parsedInput)) {
      const t = await getTranslations("metaCatalog.errors")
      throw new ChatbotXException(t("emptyScope"))
    }
    return await syncProductsToMetaCatalog({
      workspaceId,
      sync: parsedInput,
      reasons: await getReasons(),
    })
  })

export const disconnectMetaCatalogAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId] }) => {
    await integrationMetaCatalogService.disconnect(workspaceId)
  })
