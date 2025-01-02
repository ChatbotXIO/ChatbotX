import { auth } from "@/auth";
import { prisma } from "@ahachat.ai/database";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { createSafeActionClient, DEFAULT_SERVER_ERROR_MESSAGE } from "next-safe-action";

export const actionClient = createSafeActionClient({
  handleServerError(error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2025' || error.code === 'P2016') {
        return {
          message: `Unable to find ${error.meta?.modelName ?? ''} record`
        }
      }

      return {
        message: error.message
      };
    }

    return {
      message: DEFAULT_SERVER_ERROR_MESSAGE
    };
  },
}).use(async ({ next, clientInput, metadata }) => {
  console.log("LOGGING MIDDLEWARE");

  const startTime = performance.now();

  const result = await next();

  const endTime = performance.now();

  console.log("Result ->", result);
  console.log("Client input ->", clientInput);
  console.log("Metadata ->", metadata);
  console.log("Action execution took", endTime - startTime, "ms");

  return result;
});

export const authActionClient = actionClient
  .use(async ({ next }) => {
    const session = await auth()
    if (!session || !session?.user || !session.user.email) {
      throw new Error('Session not found');
    }

    const user = await prisma.user.findFirstOrThrow({ where: { email: session.user.email } })

    return next({ ctx: { user } });
  })
