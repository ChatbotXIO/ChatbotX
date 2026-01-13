import { inspect } from "node:util"
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
    query: env.PRISMA_DEBUG
      ? {
          $allModels: {
            async $allOperations({ args, query }) {
              const start = performance.now()
              const result = await query(args)
              const end = performance.now()
              const time = end - start
              console.log(
                inspect(
                  { query, time },
                  { showHidden: false, depth: null, colors: true },
                ),
              )
              return result
            },
          },
        }
      : undefined,
    result: {
      attachment: {
        url: {
          needs: { originPath: true },
          compute(attachment) {
            return new URL(
              attachment.originPath,
              env.NEXT_PUBLIC_ASSET_URL,
            ).toString()
          },
        },
      },
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
