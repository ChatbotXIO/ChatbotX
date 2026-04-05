"use server"

import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { HandleRequestType } from "@chatbotx.io/sdk"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { findOrganizationSettingsByKey } from "@/features/organization/queries"
import { integrations } from "@/integration"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type ConnectGoogleSheetsSchema,
  connectGoogleSheetsSchema,
} from "../schemas"

export const connectGoogleSheets = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectGoogleSheetsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: {
        workspace: WorkspaceModel
      }
      parsedInput: ConnectGoogleSheetsSchema
    }) => {
      const headersList = await headers()

      const googleSheetsSetting = await findOrganizationSettingsByKey(
        { id: ctx.workspace.organizationId },
        "google",
      )

      const redirectUrl = (await integrations.googleSheets.handleRequest?.({
        config: {
          ...googleSheetsSetting,
          redirectUrl: new URL(
            "/integrations/google-sheets/callback",
            parsedInput.referer,
          ).toString(),
          stateParams: {
            workspaceId: ctx.workspace.id,
            referer: parsedInput.referer,
          },
        },
        req: new Request(
          new URL(
            HandleRequestType.generateAuthUrl,
            headersList.get("x-url") ?? "",
          ),
        ),
      })) as string

      return redirect(redirectUrl)
    },
  )
