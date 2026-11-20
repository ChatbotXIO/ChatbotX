"use server"

import {
  isPlatformAdmin,
  isSuperAdmin,
  type TenantAdminScope,
  templateStoreService,
} from "@chatbotx.io/business"
import type { UserModel } from "@chatbotx.io/database/types"
import { authActionClient } from "@/lib/safe-action"
import { runTemplateStoreMutation } from "./outcome"
import {
  addTemplateStoreListingSchema,
  createTemplateStoreCategorySchema,
  deleteTemplateStoreCategorySchema,
  moveTemplateStoreCategorySchema,
  removeTemplateStoreListingSchema,
  removeTemplateStoreListingsSchema,
  renameTemplateStoreCategorySchema,
  searchTemplateStoreCandidatesSchema,
  type TemplateStoreScope,
  updateTemplateStoreListingSchema,
  updateTemplateStoreListingsSchema,
} from "./schema"

/**
 * The tenant a call manages, decided here and never taken from input. The
 * `platform` store is the root tenant's and only a super admin may touch it
 * (in cloud a super admin owns no tenant, so the platform-admin client would
 * refuse them); the `tenant` store is the caller's own white-label and needs a
 * reseller.
 */
const resolveScope = async (
  scope: TemplateStoreScope,
  user: UserModel,
): Promise<TenantAdminScope> => {
  if (scope === "platform") {
    if (!(await isSuperAdmin(user))) {
      throw new Error("Unauthorized")
    }
    return { kind: "root" }
  }
  if (!(await isPlatformAdmin(user))) {
    throw new Error("Unauthorized")
  }
  return { kind: "owner", ownerId: user.id }
}

/** The picker's search: templates still addable to this store, matching a name or Template ID. */
export const searchTemplateStoreCandidatesAction = authActionClient
  .inputSchema(searchTemplateStoreCandidatesSchema)
  .action(async ({ ctx, parsedInput }) =>
    templateStoreService.searchCandidates({
      scope: await resolveScope(parsedInput.scope, ctx.user),
      keyword: parsedInput.keyword,
    }),
  )

export const addTemplateStoreListingAction = authActionClient
  .inputSchema(addTemplateStoreListingSchema)
  .action(async ({ ctx, parsedInput }) =>
    runTemplateStoreMutation(async () =>
      templateStoreService.addListing({
        scope: await resolveScope(parsedInput.scope, ctx.user),
        templateId: parsedInput.templateId,
        categoryIds: parsedInput.categoryIds,
        languages: parsedInput.languages,
        actorUserId: ctx.user.id,
      }),
    ),
  )

export const updateTemplateStoreListingAction = authActionClient
  .inputSchema(updateTemplateStoreListingSchema)
  .action(async ({ ctx, parsedInput }) =>
    runTemplateStoreMutation(async () =>
      templateStoreService.updateListing({
        scope: await resolveScope(parsedInput.scope, ctx.user),
        listingId: parsedInput.listingId,
        categoryIds: parsedInput.categoryIds,
        languages: parsedInput.languages,
      }),
    ),
  )

/** The table's bulk edit: the same categories and/or languages for every selected listing. */
export const updateTemplateStoreListingsAction = authActionClient
  .inputSchema(updateTemplateStoreListingsSchema)
  .action(async ({ ctx, parsedInput }) =>
    runTemplateStoreMutation(async () =>
      templateStoreService.updateListings({
        scope: await resolveScope(parsedInput.scope, ctx.user),
        listingIds: parsedInput.listingIds,
        categoryIds: parsedInput.categoryIds,
        languages: parsedInput.languages,
      }),
    ),
  )

export const removeTemplateStoreListingsAction = authActionClient
  .inputSchema(removeTemplateStoreListingsSchema)
  .action(async ({ ctx, parsedInput }) =>
    runTemplateStoreMutation(async () =>
      templateStoreService.removeListings({
        scope: await resolveScope(parsedInput.scope, ctx.user),
        listingIds: parsedInput.listingIds,
      }),
    ),
  )

export const removeTemplateStoreListingAction = authActionClient
  .inputSchema(removeTemplateStoreListingSchema)
  .action(async ({ ctx, parsedInput }) =>
    runTemplateStoreMutation(async () =>
      templateStoreService.removeListing({
        scope: await resolveScope(parsedInput.scope, ctx.user),
        listingId: parsedInput.listingId,
      }),
    ),
  )

export const createTemplateStoreCategoryAction = authActionClient
  .inputSchema(createTemplateStoreCategorySchema)
  .action(async ({ ctx, parsedInput }) =>
    runTemplateStoreMutation(async () =>
      templateStoreService.createCategory({
        scope: await resolveScope(parsedInput.scope, ctx.user),
        name: parsedInput.name,
        actorUserId: ctx.user.id,
      }),
    ),
  )

export const renameTemplateStoreCategoryAction = authActionClient
  .inputSchema(renameTemplateStoreCategorySchema)
  .action(async ({ ctx, parsedInput }) =>
    runTemplateStoreMutation(async () =>
      templateStoreService.renameCategory({
        scope: await resolveScope(parsedInput.scope, ctx.user),
        categoryId: parsedInput.categoryId,
        name: parsedInput.name,
      }),
    ),
  )

export const moveTemplateStoreCategoryAction = authActionClient
  .inputSchema(moveTemplateStoreCategorySchema)
  .action(async ({ ctx, parsedInput }) =>
    runTemplateStoreMutation(async () =>
      templateStoreService.moveCategory({
        scope: await resolveScope(parsedInput.scope, ctx.user),
        categoryId: parsedInput.categoryId,
        direction: parsedInput.direction,
      }),
    ),
  )

export const deleteTemplateStoreCategoryAction = authActionClient
  .inputSchema(deleteTemplateStoreCategorySchema)
  .action(async ({ ctx, parsedInput }) =>
    runTemplateStoreMutation(async () =>
      templateStoreService.deleteCategory({
        scope: await resolveScope(parsedInput.scope, ctx.user),
        categoryId: parsedInput.categoryId,
      }),
    ),
  )
