import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

const enableDebug = process.env.PRISMA_DEBUG === "true"

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: enableDebug ? ['query', 'info', 'warn', 'error'] : undefined
})

if (enableDebug) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  prisma.$on("query", (e) => {
    // @ts-ignore
    console.log("Params: " + e.params)
    // @ts-ignore
    console.log("Duration: " + e.duration + "ms")
  })
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
