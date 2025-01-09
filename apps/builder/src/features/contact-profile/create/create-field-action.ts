"use server";

import { authActionClient } from "@/lib/safe-action";
import { prisma, User } from "@ahachat.ai/database";
import {
  CreateFieldBindSchema,
  createFieldBindSchema,
  createFieldSchema,
  CreateFieldSchema,
} from "./create-field-schema";

export const createFieldAction = authActionClient
  .schema(createFieldSchema)
  .bindArgsSchemas(createFieldBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [fieldType, chatbotId],
    }: {
      ctx: { user: User };
      parsedInput: CreateFieldSchema;
      bindArgsParsedInputs: CreateFieldBindSchema;
    }) => {
      // TODO: save form to DB
      console.log(fieldType, chatbotId, 11);

      return {
        successful: true,
        field: {
          ...parsedInput,
          id: (Math.random() * 1000000).toString()
        }
      };
    },
  );
