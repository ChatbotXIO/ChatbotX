"use server"

import { customFieldService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateCustomFieldRequest,
  createCustomFieldRequest,
} from "../schemas/action"
import type { CustomFieldResource } from "../schemas/resource"

export const createCustomFieldAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createCustomFieldRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateCustomFieldRequest
    }) => {
      await createCustomField(workspaceId, parsedInput)
    },
  )

export const createCustomField = async (
  workspaceId: string,
  parsedInput: CreateCustomFieldRequest,
): Promise<CustomFieldResource> =>
  await customFieldService.create({ workspaceId, data: parsedInput })
