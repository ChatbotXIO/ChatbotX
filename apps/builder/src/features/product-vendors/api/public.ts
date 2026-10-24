import { vendorService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingProductVendor,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingProductVendor,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createProductVendorPublicRequest,
  listProductVendorsPublicRequest,
  listProductVendorsPublicResponse,
  publicProductVendorWriteResource,
  updateProductVendorPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

export const productVendorsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/product-vendors",
      summary: "List product vendors",
      description:
        "Vendors (sellers or brands) a product can be assigned to with `vendorId` on `products.create`/`products.update`, with how many products each has.",
      tags: ["Product Vendors"],
    })
    .input(listProductVendorsPublicRequest)
    .output(listProductVendorsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await vendorService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/product-vendors",
      summary: "Create product vendor",
      description:
        "Names are unique per workspace, ignoring case: `Acme` and `acme` are the same vendor.",
      tags: ["Product Vendors"],
    })
    .input(createProductVendorPublicRequest)
    .output(publicProductVendorWriteResource)
    .errors(possibleErrorsOnCreatingProductVendor)
    .handler(
      async ({ context, input }) =>
        await vendorService.create({
          workspaceId: context.workspace.id,
          ...input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/product-vendors/{id}",
      summary: "Update product vendor",
      description:
        "Changes the fields sent and leaves the rest. Use `productVendors.list` to find the id first.",
      tags: ["Product Vendors"],
    })
    .input(updateProductVendorPublicRequest)
    .output(publicProductVendorWriteResource)
    .errors(possibleErrorsOnMutatingProductVendor)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await vendorService.update({
        workspaceId: context.workspace.id,
        vendorId: id,
        data,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/product-vendors/{id}",
      summary: "Delete product vendor",
      description:
        "Deletes the vendor. Its products are kept and left without a vendor. Use `productVendors.list` to find the id first.",
      successStatus: 204,
      tags: ["Product Vendors"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Vendor id. Get it from `productVendors.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await vendorService.delete({
        workspaceId: context.workspace.id,
        vendorId: input.id,
      })
    }),
}
