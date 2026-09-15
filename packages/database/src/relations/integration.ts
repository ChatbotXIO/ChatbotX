import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationRelations = defineRelationsPart(schema, (r) => ({
  integrationModel: {
    workspace: r.one.workspaceModel({
      from: r.integrationModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    integrationOpenai: r.one.integrationOpenaiModel({
      from: r.integrationModel.id,
      to: r.integrationOpenaiModel.integrationId,
    }),
    integrationGoogleSheet: r.one.integrationGoogleSheetsModel({
      from: r.integrationModel.id,
      to: r.integrationGoogleSheetsModel.integrationId,
    }),
    integrationActiveCampaign: r.one.integrationActiveCampaignModel({
      from: r.integrationModel.id,
      to: r.integrationActiveCampaignModel.integrationId,
    }),
    integrationMailchimp: r.one.integrationMailchimpModel({
      from: r.integrationModel.id,
      to: r.integrationMailchimpModel.integrationId,
    }),
    integrationMailerLite: r.one.integrationMailerLiteModel({
      from: r.integrationModel.id,
      to: r.integrationMailerLiteModel.integrationId,
    }),
    integrationMoosend: r.one.integrationMoosendModel({
      from: r.integrationModel.id,
      to: r.integrationMoosendModel.integrationId,
    }),
    integrationDrip: r.one.integrationDripModel({
      from: r.integrationModel.id,
      to: r.integrationDripModel.integrationId,
    }),
    integrationGetResponse: r.one.integrationGetResponseModel({
      from: r.integrationModel.id,
      to: r.integrationGetResponseModel.integrationId,
    }),
    integrationSendGrid: r.one.integrationSendGridModel({
      from: r.integrationModel.id,
      to: r.integrationSendGridModel.integrationId,
    }),
    integrationGemini: r.one.integrationGeminiModel({
      from: r.integrationModel.id,
      to: r.integrationGeminiModel.integrationId,
    }),
    connections: r.many.connectionModel({
      from: r.integrationModel.id,
      to: r.connectionModel.integrationId,
    }),
  },
}))
