import { type Prisma, prisma } from "@aha.chat/database"

export async function listFlowVersions({
  where,
}: {
  where: Prisma.FlowVersionWhereInput
}) {
  const [data] = await prisma.$transaction([
    prisma.flowVersion.findMany({
      where,
      include: {
        flow: true,
      },
    }),
  ])

  return { data, pageCount: 1 }
}
