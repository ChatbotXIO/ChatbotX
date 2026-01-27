import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "./generated/prisma/client"
import { keys } from "./keys"

const env = keys()
const pool = new PrismaPg({ connectionString: env.DATABASE_URL })
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter: pool,
    log: env.PRISMA_DEBUG ? ["query"] : [],
  }).$extends({
    result: {
      aIFile: {
        url: {
          needs: { path: true },
          compute(aIFile) {
            return new URL(aIFile.path, env.NEXT_PUBLIC_ASSET_URL).toString()
          },
        },
      },
    },
  })

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export { Prisma } from "./generated/prisma/client"
export * from "./generated/prisma/enums"

export type PrismaTransactionalClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0]
