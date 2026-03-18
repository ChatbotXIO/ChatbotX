import { db, eq, relationsFilterToSQL } from "@aha.chat/database/client"
import {
  contactsOnSequenceModel,
  sequenceModel,
  sequenceStepModel,
} from "@aha.chat/database/schema"
import { parseOrderByAsObject, parsePagination } from "@aha.chat/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  GetSequencesSchema,
  SequenceResource,
} from "../schemas/get-sequences-schema"

export async function listSequences(
  input: GetSequencesSchema,
): Promise<{ data: SequenceResource[]; pageCount: number }> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  let folderIdFilter: string | { isNull: true } | undefined
  if (input.folderId) {
    folderIdFilter =
      input.folderId === "0" ? { isNull: true as const } : input.folderId
  }

  const where = {
    chatbotId: input.chatbotId,
    folderId: folderIdFilter,
    name: input.name
      ? {
          ilike: `%${input.name}%`,
        }
      : undefined,
    active:
      input.active !== undefined && input.active !== null
        ? input.active
        : undefined,
  }

  const pagination = parsePagination(input)
  const orderBy = parseOrderByAsObject(sequenceModel, input)

  const [data, total] = await Promise.all([
    db.query.sequenceModel.findMany({
      where,
      orderBy,
      ...pagination,
      extras: {
        stepsCount: (table) =>
          db.$count(
            sequenceStepModel,
            eq(sequenceStepModel.sequenceId, table.id),
          ),
        subscribersCount: (table) =>
          db.$count(
            contactsOnSequenceModel,
            eq(contactsOnSequenceModel.sequenceId, table.id),
          ),
      },
    }),
    db.$count(sequenceModel, relationsFilterToSQL(sequenceModel, where)),
  ])

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function getSequence(chatbotId: string, sequenceId: string) {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const sequence = await db.query.sequenceModel.findFirst({
    where: {
      id: sequenceId,
      chatbotId,
    },
    with: {
      sequenceSteps: {
        with: {
          flow: true,
        },
        orderBy: (step, { asc }) => [asc(step.order)],
      },
    },
  })

  if (!sequence) {
    throw new Error("Sequence not found")
  }

  return {
    ...sequence,
    steps: sequence.sequenceSteps,
  }
}
