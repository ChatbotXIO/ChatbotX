import { contactService, couponService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { ORPCError } from "@orpc/server"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { withPublicPaging } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  couponIssueErrorData,
  couponMarkUsedErrorData,
  createCouponTopicPublicRequest,
  issueCouponPublicRequest,
  listContactCouponsPublicResponse,
  listCouponsPublicRequest,
  listCouponsPublicResponse,
  listCouponTopicsPublicRequest,
  listCouponTopicsPublicResponse,
  markCouponUsedPublicRequest,
  publicCouponTopicResource,
  publicIssuedCouponResource,
  updateCouponTopicPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

const tags = ["Coupons"]

export const couponsPublicRouter = {
  listTopics: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/coupon-topics",
      summary: "List coupon topics",
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
      summary: "Get a coupon topic",
      tags,
    })
    .input(z.object({ id: zodBigintAsString() }))
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
      summary: "Create a coupon topic",
      description:
        "Creates a coupon topic. The topic is created without a `createdById` — workspace API tokens have no associated user.",
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
      method: "PATCH",
      path: "/v1/coupon-topics/{id}",
      summary: "Update a coupon topic",
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
      summary: "Archive a coupon topic",
      tags,
    })
    .input(z.object({ id: zodBigintAsString() }))
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
      summary: "Unarchive a coupon topic",
      tags,
    })
    .input(z.object({ id: zodBigintAsString() }))
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
      summary: "Delete a coupon topic",
      tags,
    })
    .input(z.object({ id: zodBigintAsString() }))
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
      tags,
    })
    .input(withPublicPaging(listCouponsPublicRequest.omit({ sort: true })))
    .output(listCouponsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const result = await couponService.listCoupons({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data: result.data, pageCount: result.pageCount }
    }),

  issueCoupon: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/coupon-topics/{id}/issue",
      summary: "Issue a coupon to a contact",
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
      summary: "Mark an issued coupon as used",
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
      path: "/v1/contacts/{contactId}/coupons",
      summary: "List coupons issued to a contact",
      tags,
    })
    .input(z.object({ contactId: zodBigintAsString() }))
    .output(listContactCouponsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      await contactService.findByIdOrFail({
        workspaceId: context.workspace.id,
        id: input.contactId,
      })
      const data = await couponService.listIssuedCouponsForContact({
        workspaceId: context.workspace.id,
        contactId: input.contactId,
      })
      return { data }
    }),
}
