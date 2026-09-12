import { qrCodeService } from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  publicCreateQrCodeRequest,
  publicCreateQrCodeResponse,
  publicDeleteQrCodeRequest,
  publicGetQrCodeRequest,
  publicListQrCodesRequest,
  publicListQrCodesResponse,
  publicQrCodeResponse,
  publicUpdateQrCodeRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")
const tags = ["QR Codes"]
const duplicateNameMessage = "QR Code name already exists"

export const qrCodesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/qr-codes",
      summary: "List QR codes",
      tags,
    })
    .input(publicListQrCodesRequest)
    .output(publicListQrCodesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await qrCodeService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/qr-codes/{id}",
      summary: "Get a QR code",
      tags,
    })
    .input(publicGetQrCodeRequest)
    .output(publicQrCodeResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await qrCodeService.findOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/qr-codes",
      summary: "Create a QR code",
      successStatus: 201,
      tags,
    })
    .input(publicCreateQrCodeRequest)
    .output(publicCreateQrCodeResponse)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await qrCodeService.create({
          workspaceId: context.workspace.id,
          data: input,
          duplicateNameMessage,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/qr-codes/{id}",
      summary: "Update a QR code",
      tags,
    })
    .input(publicUpdateQrCodeRequest)
    .output(publicQrCodeResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await qrCodeService.update({
        workspaceId: context.workspace.id,
        id,
        data,
        duplicateNameMessage,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/qr-codes/{id}",
      summary: "Delete a QR code",
      successStatus: 204,
      tags,
    })
    .input(publicDeleteQrCodeRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await qrCodeService.deleteMany({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
