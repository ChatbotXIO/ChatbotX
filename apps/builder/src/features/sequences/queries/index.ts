import { and, count, db, eq, ilike, sql } from "@aha.chat/database/client"
import { sequenceModel } from "@aha.chat/database/schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  GetSequencesSchema,
  SequenceResource,
} from "../schemas/get-sequences-schema"

export async function listSequences(
  input: GetSequencesSchema,
): Promise<{ data: SequenceResource[]; pageCount: number }> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const conditions = [eq(sequenceModel.chatbotId, input.chatbotId)]

  if (input.folderId !== undefined) {
    const folderId =
      input.folderId === null || input.folderId === "0" ? null : input.folderId
    if (folderId === null) {
      conditions.push(sql`${sequenceModel.folderId} IS NULL`)
    } else {
      conditions.push(eq(sequenceModel.folderId, folderId))
    }
  }

  if (input.name) {
    conditions.push(ilike(sequenceModel.name, `%${input.name}%`))
  }

  if (input.active !== undefined && input.active !== null) {
    conditions.push(eq(sequenceModel.active, input.active))
  }

  const whereClause = and(...conditions)

  const orderBy = input.sort.map((sortItem) => {
    const column = sequenceModel[sortItem.id as keyof typeof sequenceModel]
    return sortItem.desc ? sql`${column} DESC` : sql`${column} ASC`
  })

  const sequences = await db
    .select()
    .from(sequenceModel)
    .where(whereClause)
    .limit(input.perPage)
    .offset((input.page - 1) * input.perPage)
    .orderBy(...orderBy)

  const [totalCount] = await db
    .select({ count: count() })
    .from(sequenceModel)
    .where(whereClause)

  const pageCount = Math.ceil((totalCount?.count ?? 0) / input.perPage)

  return { data: sequences, pageCount }
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
