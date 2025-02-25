"use server"

import { authActionClient } from "@/lib/safe-action"
import { type User, prisma } from "@ahachat.ai/database"
import {
  type RemoveAutomatedResponseBindSchema,
  removeAutomatedResponseBindSchema,
} from "../schemas/remove-automated-responses-schema"

export const removeAutomatedResponseAction = authActionClient
  .bindArgsSchemas(removeAutomatedResponseBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [id],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: RemoveAutomatedResponseBindSchema
    }) => {
      await prisma.automatedResponse.delete({
        where: {
          id,
        },
      })

      return {
        successful: true,
      }
    },
  )
