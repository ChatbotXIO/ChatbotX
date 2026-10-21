import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const ecommerceRelations = defineRelationsPart(schema, (r) => ({
  vendorModel: {
    workspace: r.one.workspaceModel({
      from: r.vendorModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    products: r.many.productModel({
      from: r.vendorModel.id,
      to: r.productModel.vendorId,
    }),
    openHours: r.one.ecommerceOpenHoursModel({
      from: r.vendorModel.openHoursId,
      to: r.ecommerceOpenHoursModel.id,
    }),
    category: r.one.productCategoryModel({
      from: r.vendorModel.categoryId,
      to: r.productCategoryModel.id,
    }),
    subcategory: r.one.productCategoryModel({
      from: r.vendorModel.subcategoryId,
      to: r.productCategoryModel.id,
    }),
  },
  discountCodeModel: {
    workspace: r.one.workspaceModel({
      from: r.discountCodeModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    category: r.one.productCategoryModel({
      from: r.discountCodeModel.categoryId,
      to: r.productCategoryModel.id,
    }),
    redemptions: r.many.discountCodeRedemptionModel({
      from: r.discountCodeModel.id,
      to: r.discountCodeRedemptionModel.discountCodeId,
    }),
  },
  discountCodeRedemptionModel: {
    discountCode: r.one.discountCodeModel({
      from: r.discountCodeRedemptionModel.discountCodeId,
      to: r.discountCodeModel.id,
      optional: false,
    }),
    order: r.one.orderModel({
      from: r.discountCodeRedemptionModel.orderId,
      to: r.orderModel.id,
      optional: false,
    }),
  },
  cartModel: {
    workspace: r.one.workspaceModel({
      from: r.cartModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.cartModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
  },
  ecommerceOpenHoursModel: {
    workspace: r.one.workspaceModel({
      from: r.ecommerceOpenHoursModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
  ecommerceSettingsModel: {
    workspace: r.one.workspaceModel({
      from: r.ecommerceSettingsModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    checkoutFlow: r.one.flowModel({
      from: r.ecommerceSettingsModel.checkoutFlowId,
      to: r.flowModel.id,
    }),
    abandonedCartFlow: r.one.flowModel({
      from: r.ecommerceSettingsModel.abandonedCartFlowId,
      to: r.flowModel.id,
    }),
    openHours: r.one.ecommerceOpenHoursModel({
      from: r.ecommerceSettingsModel.openHoursId,
      to: r.ecommerceOpenHoursModel.id,
    }),
  },
  orderModel: {
    workspace: r.one.workspaceModel({
      from: r.orderModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.orderModel.contactId,
      to: r.contactModel.id,
    }),
    items: r.many.orderItemModel({
      from: r.orderModel.id,
      to: r.orderItemModel.orderId,
    }),
    history: r.many.orderStatusHistoryModel({
      from: r.orderModel.id,
      to: r.orderStatusHistoryModel.orderId,
    }),
  },
  orderItemModel: {
    order: r.one.orderModel({
      from: r.orderItemModel.orderId,
      to: r.orderModel.id,
      optional: false,
    }),
    product: r.one.productModel({
      from: r.orderItemModel.productId,
      to: r.productModel.id,
    }),
  },
  orderStatusHistoryModel: {
    order: r.one.orderModel({
      from: r.orderStatusHistoryModel.orderId,
      to: r.orderModel.id,
      optional: false,
    }),
    actorUser: r.one.userModel({
      from: r.orderStatusHistoryModel.actorUserId,
      to: r.userModel.id,
    }),
  },
}))
