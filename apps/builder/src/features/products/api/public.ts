import {
  integrationMetaCatalogService,
  productService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { createImportUpload, importService } from "@chatbotx.io/business/import"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { bulkUpdateIdsRequest } from "@/features/common/schema"
import { peekImportHeadersForApi } from "@/features/import/lib/peek-import-headers-for-api"
import {
  getProductImportPublicRequest,
  importHeadersPublicRequest,
  importHeadersPublicResponse,
  importTemplatePublicRequest,
  importUploadUrlPublicRequest,
  importUploadUrlPublicResponse,
  listContactImportsPublicRequest,
  listProductImportsPublicResponse,
  productImportPublicResource,
  productImportTemplatePublicResponse,
} from "@/features/import/schema/public"
import {
  buildProductImportTemplate,
  PRODUCT_IMPORT_TEMPLATE_MIME_TYPE,
  productImportTemplateFileName,
  resolveProductImportTemplateLocale,
} from "@/features/products/lib/product-import-template"
import {
  possibleErrorsOnCreatingImportUpload,
  possibleErrorsOnCreatingMetaCatalog,
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnDisconnectingMetaCatalog,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
  possibleErrorsOnPeekingImportHeaders,
  possibleErrorsOnStartingMetaCatalogRun,
  possibleErrorsOnStartingProductImport,
} from "@/lib/orpc/orpc-error-helper"
import { withListPagingNote, withPublicPaging } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createAndBindMetaCatalog,
  ENGLISH_META_CATALOG_REASONS,
  getMetaCatalogState,
  listMetaCatalogBusinesses,
  selectMetaCatalog,
  syncProductsToMetaCatalog,
} from "../lib/meta-catalog-operations"
import { startProductImportJob } from "../lib/start-product-import"
import {
  createMetaCatalogPublicRequest,
  createProductPublicRequest,
  listProductsPublicResponse,
  metaCatalogBusinessesPublicResponse,
  metaCatalogConnectionPublicResource,
  metaCatalogStatePublicResponse,
  metaCatalogSyncRunPublicResource,
  publicProductDetailResource,
  publicProductResource,
  selectMetaCatalogPublicRequest,
  startProductImportPublicRequest,
  startProductImportPublicResponse,
  syncMetaCatalogPublicRequest,
  updateProductPublicRequest,
} from "../schema/public"
import { listProductsRequest } from "../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

export const productsPublicRouter = {
  getMetaCatalog: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/products/meta-catalog",
      summary: "Get Meta Catalog connection",
      description:
        "Returns the workspace's Meta Catalog connection (bound catalog, import progress, token status; never the credential) and the history of syncs and imports. `connection` is null until a catalog is connected in the builder. Connecting stays in the builder (it runs Meta's OAuth); disconnect with `products.disconnectMetaCatalog`.",
      tags: ["Products"],
    })
    .output(metaCatalogStatePublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context }) => {
      const state = await getMetaCatalogState(context.workspace.id)
      return metaCatalogStatePublicResponse.parse(state)
    }),

  disconnectMetaCatalog: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/products/meta-catalog",
      summary: "Disconnect Meta Catalog",
      description:
        "Disconnects the workspace's Meta Catalog, as the Disconnect button in the builder does: the stored credential is dropped and products stop syncing to Meta. Products already in the workspace are kept. Returns 409 while a sync or import is running; a workspace without a connected catalog gets 204 too. Works on a trial-expired workspace.",
      successStatus: 204,
      tags: ["Products"],
    })
    .errors(possibleErrorsOnDisconnectingMetaCatalog)
    .handler(async ({ context }) => {
      await integrationMetaCatalogService.disconnect(context.workspace.id)
    }),

  listMetaCatalogBusinesses: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/products/meta-catalog/businesses",
      summary: "List Meta Business Managers",
      description:
        "Lists the Business Managers the connected Meta token can create a catalog under. Needs a connected Meta Catalog.",
      tags: ["Products"],
    })
    .output(metaCatalogBusinessesPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context }) =>
        await listMetaCatalogBusinesses(context.workspace.id),
    ),

  createMetaCatalog: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/products/meta-catalog",
      summary: "Create Meta Catalog",
      description:
        "Creates an empty catalog on Meta under the given Business Manager and binds it to the workspace. Needs a Meta Catalog connection made in the builder (404 otherwise; check with `products.getMetaCatalog`). Nothing is imported; push products with `products.syncMetaCatalog`.",
      successStatus: 201,
      tags: ["Products"],
    })
    .input(createMetaCatalogPublicRequest)
    .output(metaCatalogConnectionPublicResource)
    .errors(possibleErrorsOnCreatingMetaCatalog)
    .handler(async ({ context, input }) =>
      metaCatalogConnectionPublicResource.parse(
        await createAndBindMetaCatalog({
          workspaceId: context.workspace.id,
          ...input,
        }),
      ),
    ),

  selectMetaCatalog: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/products/meta-catalog/select",
      summary: "Select Meta Catalog and import",
      description:
        "Binds an existing Meta catalog and starts importing its products in the background (it adds and updates local products). Track it with `products.getMetaCatalog`. Returns 409 while another sync or import is running.",
      successStatus: 202,
      tags: ["Products"],
    })
    .input(selectMetaCatalogPublicRequest)
    .output(metaCatalogConnectionPublicResource)
    .errors(possibleErrorsOnStartingMetaCatalogRun)
    .handler(async ({ context, input }) =>
      metaCatalogConnectionPublicResource.parse(
        await selectMetaCatalog({
          workspaceId: context.workspace.id,
          catalogId: input.catalogId,
          reasons: ENGLISH_META_CATALOG_REASONS,
        }),
      ),
    ),

  syncMetaCatalog: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/products/meta-catalog/sync",
      summary: "Push products to Meta Catalog",
      description:
        "Starts pushing products to the destination catalog in the background: `all`, one `category` or `selected` product ids. Track it with `products.getMetaCatalog`. Returns 409 while another sync or import is running.",
      successStatus: 202,
      tags: ["Products"],
    })
    .input(syncMetaCatalogPublicRequest)
    .output(metaCatalogSyncRunPublicResource)
    .errors(possibleErrorsOnStartingMetaCatalogRun)
    .handler(async ({ context, input }) =>
      metaCatalogSyncRunPublicResource.parse(
        await syncProductsToMetaCatalog({
          workspaceId: context.workspace.id,
          sync: input,
          reasons: ENGLISH_META_CATALOG_REASONS,
        }),
      ),
    ),

  getImportTemplate: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/products/import-template",
      summary: "Get product import template",
      description:
        "Returns the XLSX template for product imports as base64 (`contentBase64`): a header row plus two example rows. Decode it to a .xlsx file, fill it in, then upload it with `products.createImportUpload`.",
      tags: ["Products"],
    })
    .input(importTemplatePublicRequest)
    .output(productImportTemplatePublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const locale = resolveProductImportTemplateLocale(
        input.language ?? context.workspace.language,
      )
      const template = await buildProductImportTemplate(locale)
      return {
        fileName: productImportTemplateFileName(locale),
        mimeType: PRODUCT_IMPORT_TEMPLATE_MIME_TYPE,
        contentBase64: template.toString("base64"),
      }
    }),

  peekImportHeaders: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/products/imports/files/{fileId}/headers",
      summary: "Read product import file headers",
      description:
        "Returns the column headers of an uploaded product import file so you can map columns before importing. Call `products.createImportUpload` and upload the file first.",
      tags: ["Products"],
    })
    .input(importHeadersPublicRequest)
    .output(importHeadersPublicResponse)
    .errors(possibleErrorsOnPeekingImportHeaders)
    .handler(async ({ context, input }) => ({
      headers: await peekImportHeadersForApi({
        workspaceId: context.workspace.id,
        fileId: input.fileId,
        type: "products",
      }),
    })),

  createImportUpload: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/products/imports/upload-url",
      summary: "Create product import upload URL",
      description:
        "Step 1 of a product import: declares the CSV or XLSX (`fileName`, `mimeType`, `fileSize` in bytes, max 10 MB) and returns a presigned `presignedPostUrl` plus a `fileId`. Upload the file bytes to `presignedPostUrl` with an HTTP PUT, then start the import with `products.startImport` using that `fileId`.",
      successStatus: 201,
      tags: ["Products"],
    })
    .input(importUploadUrlPublicRequest)
    .output(importUploadUrlPublicResponse)
    .errors(possibleErrorsOnCreatingImportUpload)
    .handler(
      async ({ context, input }) =>
        await createImportUpload({
          ...input,
          workspaceId: context.workspace.id,
          userId: null,
          type: "products",
        }),
    ),

  startImport: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/products/imports",
      summary: "Import products from file",
      description:
        "Starts an asynchronous bulk import of products from an uploaded CSV or XLSX file. Flow: `products.getImportTemplate` for the format, `products.createImportUpload` to get a `fileId` and upload URL, upload the file, `products.peekImportHeaders` to read its columns, then call this with `fileId`, `format` and `columnMap` (product field to file column header; only `name` is required). Every row is inserted as a new product (importing the same file twice creates duplicates; use `products.update` to change existing products). A category named in the file that does not exist is created unless `createMissingCategories` is false, in which case that row fails. Failed rows are listed in `errorSample` of `products.getImport`. Returns an `importId` immediately; track it with `products.getImport`. Only one product import can run per workspace: while one is pending or processing this returns 409.",
      successStatus: 201,
      tags: ["Products"],
    })
    .input(startProductImportPublicRequest)
    .output(startProductImportPublicResponse)
    .errors(possibleErrorsOnStartingProductImport)
    .handler(
      async ({ context, input }) =>
        await startProductImportJob({
          workspaceId: context.workspace.id,
          userId: null,
          fileId: input.fileId,
          format: input.format,
          meta: {
            columnMap: input.columnMap,
            createMissingCategories: input.createMissingCategories,
          },
        }),
    ),

  listImports: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/products/imports",
      summary: "List product import jobs",
      description: withListPagingNote(
        "Returns background product-import jobs started with `products.startImport`, most recent first. Use `products.getImport` for one job's full detail.",
      ),
      tags: ["Products"],
    })
    .input(listContactImportsPublicRequest)
    .output(listProductImportsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { data, pageCount } = await importService.list({
        ...input,
        workspaceId: context.workspace.id,
        type: "products",
      })
      return {
        data: data.map((row) => ({ ...row, type: "products" as const })),
        pageCount,
      }
    }),

  getImport: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/products/imports/{id}",
      summary: "Get product import job",
      description:
        "Returns one product import job's progress, result counts and `errorSample` (a sample of failed rows with the reason). Call `products.listImports` to find its id first.",
      tags: ["Products"],
    })
    .input(getProductImportPublicRequest)
    .output(productImportPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const imported = await importService.find({
        workspaceId: context.workspace.id,
        id: input.id,
        type: "products",
      })
      if (!imported) {
        throw notFoundException("Import not found")
      }
      return { ...imported, type: "products" as const }
    }),

  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/products",
      summary: "List products",
      description:
        "Use this to find product ids before inspecting one with `products.get` or changing one with `products.update`. Returns products in this workspace.",
      tags: ["Products"],
    })
    .input(withPublicPaging(listProductsRequest.omit({ sort: true })))
    .output(listProductsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await productService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/products/{id}",
      summary: "Get product",
      description:
        "Returns full product detail, including variant options, variants, and addons.",
      tags: ["Products"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Product id. Get it from `products.list`.",
        ),
      }),
    )
    .output(publicProductDetailResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await productService.findById(input.id, context.workspace.id),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/products",
      summary: "Create product",
      description:
        "Adds a product, including its variant options, variants, and addons, in one call.",
      tags: ["Products"],
    })
    .input(createProductPublicRequest)
    .output(publicProductResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await productService.createFull({
          workspaceId: context.workspace.id,
          ...input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/products/{id}",
      summary: "Replace or rename product",
      description:
        "Use this to rename a product or change its price, variants, or addons. Fully replaces the product, including its variant options, variants, and addons.",
      successStatus: 204,
      tags: ["Products"],
    })
    .input(
      updateProductPublicRequest.and(
        z.object({
          id: zodBigintAsString().describe(
            "Product id. Get it from `products.list`.",
          ),
        }),
      ),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      await productService.updateFull({
        workspaceId: context.workspace.id,
        productId: id,
        ...data,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/products/{id}",
      summary: "Delete product",
      description:
        "Permanently deletes a product and its variants/addons. Use `products.list` to find its id first.",
      successStatus: 204,
      tags: ["Products"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Product id. Get it from `products.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      // findById throws notFoundException (-> 404) for a missing id, so the
      // delete call below never silently no-ops on a nonexistent product.
      await productService.findById(input.id, context.workspace.id)
      await productService.delete({
        ids: [input.id],
        workspaceId: context.workspace.id,
      })
    }),

  setActive: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/products/{id}/active",
      summary: "Enable or disable product",
      description:
        "Shows or hides a product in the catalog without replacing it. Call `products.get` to see the result, or `products.update` to change its price, variants or addons instead.",
      successStatus: 204,
      tags: ["Products"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Product id. Get it from `products.list`.",
        ),
        isActive: z
          .boolean()
          .describe("Whether the product is shown in the catalog."),
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      // findById throws notFoundException (-> 404); `update` alone would
      // silently no-op on a missing id.
      await productService.findById(input.id, workspaceId)
      await productService.update({
        productId: input.id,
        workspaceId,
        data: { isActive: input.isActive },
      })
    }),

  deleteMany: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/products/bulk-delete",
      summary: "Delete multiple products",
      description:
        "Permanently deletes several products and their variants/addons in one call; ids outside this workspace are ignored. Use `products.list` to find their ids first.",
      successStatus: 204,
      tags: ["Products"],
    })
    .input(bulkUpdateIdsRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await productService.delete({
        ids: input.ids,
        workspaceId: context.workspace.id,
      })
    }),
}
