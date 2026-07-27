import { couponService } from "@chatbotx.io/business"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { getCouponExportFile } from "../queries/get-export-file.query"
import {
  createCouponTopicRequest,
  topicIdRequest,
  updateCouponTopicRequest,
} from "../schemas/mutation"
import {
  exportCouponCountRequest,
  getCouponExportFileRequest,
  listContactCouponsRequest,
  listContactCouponsResponse,
  listCouponsRequest,
  listCouponsResponse,
  listCouponTopicOptionsRequest,
  listCouponTopicOptionsResponse,
  listCouponTopicsRequest,
  listCouponTopicsResponse,
} from "../schemas/query"
import {
  couponTopicResource,
  exportCouponCountResponse,
  getCouponExportFileResponse,
} from "../schemas/resource"

const tags = ["Coupons"]

export const couponsAuthenticatedAPI = {
  listCouponTopicsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/coupons/topics",
      summary: "List coupon topics",
      tags,
    })
    .input(listCouponTopicsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listCouponTopicsResponse)
    .handler(
      async ({ input }) =>
        await couponService.listTopics({
          ...input,
          search: input.search ?? undefined,
        }),
    ),

  createCouponTopicAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/coupons/topics",
      summary: "Create coupon topic",
      tags,
    })
    .input(createCouponTopicRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(couponTopicResource)
    .handler(async ({ input, context }) => {
      const { workspaceId, ...data } = input
      return await couponService.createTopic({
        workspaceId,
        createdById: context.user?.id ?? null,
        ...data,
      })
    }),

  updateCouponTopicAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: "/workspaces/{workspaceId}/coupons/topics/{topicId}",
      summary: "Update coupon topic",
      tags,
    })
    .input(updateCouponTopicRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(couponTopicResource)
    .handler(async ({ input }) => await couponService.updateTopic(input)),

  archiveCouponTopicAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/coupons/topics/{topicId}/archive",
      summary: "Archive coupon topic",
      tags,
    })
    .input(topicIdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(couponTopicResource)
    .handler(async ({ input }) => await couponService.archiveTopic(input)),

  unarchiveCouponTopicAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/coupons/topics/{topicId}/unarchive",
      summary: "Unarchive coupon topic",
      tags,
    })
    .input(topicIdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(couponTopicResource)
    .handler(async ({ input }) => await couponService.unarchiveTopic(input)),

  deleteCouponTopicAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/coupons/topics/{topicId}",
      summary: "Delete coupon topic",
      tags,
    })
    .input(topicIdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(couponTopicResource)
    .handler(async ({ input }) => await couponService.deleteTopic(input)),

  listCouponsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/coupons",
      summary: "List coupons",
      tags,
    })
    .input(listCouponsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listCouponsResponse)
    .handler(
      async ({ input }) =>
        await couponService.listCoupons({
          ...input,
          topicId: input.topicId ?? undefined,
          issueStatus: input.issueStatus ?? undefined,
          usageStatus: input.usageStatus ?? undefined,
          search: input.search ?? undefined,
        }),
    ),

  listCouponTopicOptionsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/coupons/topic-options",
      summary: "List coupon topic options",
      tags,
    })
    .input(listCouponTopicOptionsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listCouponTopicOptionsResponse)
    .handler(
      async ({ input }) => await couponService.listActiveTopicOptions(input),
    ),

  countCouponExportAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/coupons/export-count",
      summary: "Count coupon export rows",
      tags,
    })
    .input(exportCouponCountRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(exportCouponCountResponse)
    .handler(async ({ input }) => ({
      count: await couponService.countCoupons({
        ...input,
        topicId: input.topicId ?? undefined,
        issueStatus: input.issueStatus ?? undefined,
        usageStatus: input.usageStatus ?? undefined,
        search: input.search ?? undefined,
      }),
    })),

  getCouponExportFileAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/coupons/export-files/{fileId}",
      summary: "Get coupon export file status",
      tags,
    })
    .input(getCouponExportFileRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(getCouponExportFileResponse)
    .handler(async ({ input }) => await getCouponExportFile(input)),

  listContactCouponsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/coupons",
      summary: "List issued coupons for a contact",
      tags,
    })
    .input(listContactCouponsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listContactCouponsResponse)
    .handler(
      async ({ input }) =>
        await couponService.listIssuedCouponsForContact(input),
    ),
}
