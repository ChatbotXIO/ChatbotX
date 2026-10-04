import { contactService, couponService } from "@chatbotx.io/business"
import { uploader } from "@chatbotx.io/filesystem"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { ORPCError } from "@orpc/server"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"
import { withPublicPaging } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { createPublicCouponImportUpload } from "../lib/create-public-import-upload"
import {
  bulkCreateCouponsPublicRequest,
  bulkCreateCouponsPublicResponse,
  couponIssueErrorData,
  couponMarkUsedErrorData,
  createCouponImportUploadUrlPublicRequest,
  createCouponImportUploadUrlPublicResponse,
  createCouponTopicPublicRequest,
  getCouponExportPublicRequest,
  getCouponExportPublicResponse,
  issueCouponPublicRequest,
  listContactCouponsPublicResponse,
  listCouponsPublicResponse,
  listCouponTopicsPublicRequest,
  listCouponTopicsPublicResponse,
  markCouponUsedPublicRequest,
  publicCouponTopicResource,
  publicIssuedCouponResource,
  publicListCouponsRequest,
  startCouponExportPublicRequest,
  startCouponExportPublicResponse,
  startCouponImportPublicRequest,
  startCouponImportPublicResponse,
  updateCouponTopicPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

const tags = ["Coupons"]

const couponImportErrors = {
  couponImportFileNotFound: {
    message: "Coupon import file not found",
    status: 404,
  },
  couponImportUnsupportedFile: {
    message: "Unsupported coupon import file",
    status: 400,
  },
  couponImportFileTooLarge: {
    message: "Coupon import file exceeds the maximum allowed size",
    status: 400,
  },
  couponTopicInactive: {
    message: "Coupon topic is not active",
    status: 400,
  },
  couponImportLimitExceeded: {
    message: "Coupon import exceeds topic limit",
    status: 400,
  },
}

export const couponsPublicRouter = {
  listTopics: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/coupon-topics",
      summary: "List coupon topics",
      description:
        "Use this to find coupon topic ids before inspecting one with `coupons.getTopic` or issuing from it with `coupons.issueCoupon`. Returns coupon topics in this workspace.",
      tags,
    })
    .input(withPublicPaging(listCouponTopicsPublicRequest.omit({ sort: true })))
    .output(listCouponTopicsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const result = await couponService.listTopics({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data: result.data, pageCount: result.pageCount }
    }),

  getTopic: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/coupon-topics/{id}",
      summary: "Get coupon topic",
      description:
        "Returns one coupon topic's settings. Use `coupons.listTopics` to find its id first.",
      tags,
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Coupon topic id. Get it from `coupons.listTopics`.",
        ),
      }),
    )
    .output(publicCouponTopicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await couponService.getTopic({
          workspaceId: context.workspace.id,
          topicId: input.id,
        }),
    ),

  createTopic: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/coupon-topics",
      summary: "Create coupon topic",
      description:
        "Adds a coupon topic without `createdById` because workspace API tokens have no user. Use `coupons.listTopics` to inspect existing topics before creating another.",
      tags,
    })
    .input(createCouponTopicPublicRequest)
    .output(publicCouponTopicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await couponService.createTopic({
          workspaceId: context.workspace.id,
          createdById: null,
          ...input,
        }),
    ),

  updateTopic: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/coupon-topics/{id}",
      summary: "Update coupon topic",
      description:
        "Changes an existing coupon topic's settings. Call `coupons.getTopic` to inspect current values first.",
      tags,
    })
    .input(updateCouponTopicPublicRequest)
    .output(publicCouponTopicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await couponService.updateTopic({
        workspaceId: context.workspace.id,
        topicId: id,
        ...data,
      })
    }),

  archiveTopic: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/coupon-topics/{id}/archive",
      summary: "Archive coupon topic",
      description:
        "Stops a topic from being issueable via `coupons.issueCoupon` without deleting it. Use `coupons.unarchiveTopic` to reverse.",
      tags,
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Coupon topic id. Get it from `coupons.listTopics`.",
        ),
      }),
    )
    .output(publicCouponTopicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await couponService.archiveTopic({
          workspaceId: context.workspace.id,
          topicId: input.id,
        }),
    ),

  unarchiveTopic: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/coupon-topics/{id}/unarchive",
      summary: "Unarchive coupon topic",
      description:
        "Reactivates an archived coupon topic so it becomes issueable via `coupons.issueCoupon` again.",
      tags,
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Coupon topic id. Get it from `coupons.listTopics`.",
        ),
      }),
    )
    .output(publicCouponTopicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await couponService.unarchiveTopic({
          workspaceId: context.workspace.id,
          topicId: input.id,
        }),
    ),

  deleteTopic: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/coupon-topics/{id}",
      summary: "Delete coupon topic",
      description:
        "Permanently deletes a coupon topic. Use `coupons.listTopics` to find its id first.",
      tags,
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Coupon topic id. Get it from `coupons.listTopics`.",
        ),
      }),
    )
    .output(publicCouponTopicResource)
    .errors(possibleErrorsOnDeletingResource)
    .handler(
      async ({ context, input }) =>
        await couponService.deleteTopic({
          workspaceId: context.workspace.id,
          topicId: input.id,
        }),
    ),

  listCoupons: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/coupons",
      summary: "List coupons",
      description:
        "Use this to find individual coupon codes across topics. Returns coupons in this workspace.",
      tags,
    })
    .input(publicListCouponsRequest)
    .output(listCouponsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const {
        status,
        usage,
        keyword,
        issueStatus,
        usageStatus,
        search,
        ...filters
      } = input
      const result = await couponService.listCoupons({
        ...filters,
        issueStatus: status ?? issueStatus,
        usageStatus: usage ?? usageStatus,
        search: keyword ?? search,
        workspaceId: context.workspace.id,
      })
      return { data: result.data, pageCount: result.pageCount }
    }),

  issueCoupon: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/coupon-topics/{id}/issue",
      summary: "Issue coupon to contact",
      description:
        "Issues a coupon from the topic to the contact. Idempotent: reissuing to the same contact returns the coupon already issued to them (`existing`) rather than a duplicate. Fails with `couponIssueUnavailable` when the topic is not issueable (`topicUnavailable`) or has no available coupon left (`noAvailableCoupon`).",
      tags,
    })
    .input(issueCouponPublicRequest)
    .output(publicIssuedCouponResource)
    .errors({
      ...possibleErrorsOnMutatingResource,
      couponIssueUnavailable: {
        message: "No coupon could be issued for this topic",
        status: 409,
        data: couponIssueErrorData,
      },
    })
    .handler(async ({ context, input }) => {
      // The coupon row is workspace-scoped but `issuedContactId` is written
      // unchecked, so an unvalidated `contactId` would stamp a foreign
      // workspace's contact onto this workspace's coupon. Every other caller
      // (the flow step) takes `contactId` from the conversation, which is
      // already workspace-bound; a token-supplied id is not.
      await contactService.findByIdOrFail({
        workspaceId: context.workspace.id,
        id: input.contactId,
      })
      const result = await couponService.issueCoupon({
        workspaceId: context.workspace.id,
        topicId: input.id,
        contactId: input.contactId,
      })
      if (!result.ok) {
        throw new ORPCError("couponIssueUnavailable", {
          message: "No coupon could be issued for this topic",
          data: { reason: result.reason },
        })
      }
      return result.coupon
    }),

  markCouponUsed: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/coupon-topics/{id}/mark-used",
      summary: "Mark issued coupon as used",
      description:
        "Marks the coupon issued to the contact as used. Fails with `couponNotIssued` (`noIssuedCoupon`) when the contact has no coupon issued from this topic.",
      tags,
    })
    .input(markCouponUsedPublicRequest)
    .output(publicIssuedCouponResource)
    .errors({
      ...possibleErrorsOnMutatingResource,
      couponNotIssued: {
        message: "No coupon has been issued to this contact for this topic",
        status: 404,
        data: couponMarkUsedErrorData,
      },
    })
    .handler(async ({ context, input }) => {
      // Same reason as `issueCoupon`: scope the caller-supplied contact to
      // this workspace before it reaches the coupon row.
      await contactService.findByIdOrFail({
        workspaceId: context.workspace.id,
        id: input.contactId,
      })
      const result = await couponService.markCouponUsed({
        workspaceId: context.workspace.id,
        topicId: input.id,
        contactId: input.contactId,
      })
      if (!result.ok) {
        throw new ORPCError("couponNotIssued", {
          message: "No coupon has been issued to this contact for this topic",
          data: { reason: result.reason },
        })
      }
      return result.coupon
    }),

  listContactCoupons: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/coupons",
      summary: "List coupons issued to contact",
      description:
        "Returns every coupon issued to a specific contact, across all topics. Use `contacts.list` to find the contact first.",
      tags,
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
      }),
    )
    .output(listContactCouponsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const data = await couponService.listIssuedCouponsForContact({
        workspaceId: context.workspace.id,
        contactId,
      })
      return { data }
    }),

  bulkCreate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/coupon-topics/{topicId}/coupons/bulk",
      summary: "Bulk create coupon codes",
      description:
        "Adds coupon codes to an active topic. Duplicate codes are ignored and the topic limit is enforced.",
      tags,
    })
    .input(bulkCreateCouponsPublicRequest)
    .output(bulkCreateCouponsPublicResponse)
    .errors({
      ...possibleErrorsOnMutatingResource,
      couponTopicInactive: couponImportErrors.couponTopicInactive,
      couponImportLimitExceeded: couponImportErrors.couponImportLimitExceeded,
    })
    .handler(async ({ context, input }) => {
      const { topicId, codes } = input
      return await couponService.importBatch({
        workspaceId: context.workspace.id,
        topicId,
        codes,
      })
    }),

  createImportUploadUrl: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/coupon-imports/upload-url",
      summary: "Create coupon CSV upload URL",
      description:
        "Creates a short-lived upload URL for a CSV file. After uploading bytes to that URL, call `coupons.import` with the returned fileId. Standard MCP clients cannot upload binary data; use `coupons.bulkCreate` for text-only codes.",
      tags,
      successStatus: 201,
    })
    .input(createCouponImportUploadUrlPublicRequest)
    .output(createCouponImportUploadUrlPublicResponse)
    .errors({
      ...possibleErrorsOnCreatingResource,
      couponImportUnsupportedFile:
        couponImportErrors.couponImportUnsupportedFile,
    })
    .handler(
      async ({ context, input }) =>
        await createPublicCouponImportUpload({
          workspaceId: context.workspace.id,
          ownerId: context.workspace.ownerId,
          fileName: input.fileName,
          mimeType: input.mimeType,
        }),
    ),

  import: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/coupon-imports",
      summary: "Import coupon codes from CSV",
      description:
        "Queues a CSV coupon import for an active topic. Create the file with `coupons.createImportUploadUrl`, upload the bytes, then call this operation with its fileId.",
      tags,
      successStatus: 201,
    })
    .input(startCouponImportPublicRequest)
    .output(startCouponImportPublicResponse)
    .errors({
      ...possibleErrorsOnMutatingResource,
      couponImportFileNotFound: couponImportErrors.couponImportFileNotFound,
      couponImportUnsupportedFile:
        couponImportErrors.couponImportUnsupportedFile,
      couponImportFileTooLarge: couponImportErrors.couponImportFileTooLarge,
      couponTopicInactive: couponImportErrors.couponTopicInactive,
    })
    .handler(async ({ context, input }) => {
      const row = await couponService.startImport({
        workspaceId: context.workspace.id,
        userId: context.workspace.ownerId,
        fileId: input.fileId,
        topicId: input.topicId,
      })

      await defaultQueue.add(
        DefaultJobAction.runImport,
        {
          type: DefaultJobAction.runImport,
          data: { importId: row.id },
        },
        { jobId: `import-coupons-${row.id}` },
      )

      return { importId: row.id }
    }),

  export: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/coupon-exports",
      summary: "Export coupon codes to CSV",
      description:
        "Queues a CSV export. Call `coupons.getExport` with the returned fileId until its status is uploaded, then use downloadUrl.",
      tags,
      successStatus: 201,
    })
    .input(startCouponExportPublicRequest)
    .output(startCouponExportPublicResponse)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const exportId = createId()
      const fileName = `coupons-${new Date().toISOString().slice(0, 10)}.csv`
      const outputPath = `workspaces/${context.workspace.id}/exports/coupons/coupon_${exportId}.csv`
      const file = await couponService.createExportFile({
        workspaceId: context.workspace.id,
        userId: context.workspace.ownerId,
        fileName,
        path: outputPath,
      })

      await defaultQueue.add(
        DefaultJobAction.exportCoupons,
        {
          type: DefaultJobAction.exportCoupons,
          data: {
            workspaceId: context.workspace.id,
            requestedUserId: context.workspace.ownerId,
            fileId: file.id,
            outputPath,
            outputFormat: "csv",
            filter: {
              topicId: input.topicId,
              issueStatus: input.issueStatus,
              usageStatus: input.usageStatus,
              search: input.search,
            },
          },
        },
        {
          jobId: `export-coupons-${context.workspace.id}-${context.workspace.ownerId}-${file.id}`,
        },
      )

      return { fileId: file.id }
    }),

  getExport: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/coupon-exports/{fileId}",
      summary: "Get coupon export status",
      description:
        "Returns export progress. downloadUrl is available only after the export status becomes uploaded.",
      tags,
    })
    .input(getCouponExportPublicRequest)
    .output(getCouponExportPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const file = await couponService.getExportFile({
        workspaceId: context.workspace.id,
        fileId: input.fileId,
        userId: context.workspace.ownerId,
      })
      const downloadUrl =
        file.status === "uploaded"
          ? await uploader.getPresignedDownload(file.path, 5 * 60)
          : null

      return {
        status: file.status,
        fileName: file.fileName,
        downloadUrl,
        totalRecords: file.totalRecords,
      }
    }),
}
