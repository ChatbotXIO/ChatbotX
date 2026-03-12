import { ModelNotfoundException } from "@aha.chat/database/errors"
import { ORPCError } from "@orpc/server"
import { NotfoundException } from "./exception"

export const rethrowAsORPCError = (error: unknown): never => {
  if (error instanceof ORPCError) {
    throw error
  }

  if (
    error instanceof NotfoundException ||
    error instanceof ModelNotfoundException
  ) {
    throw new ORPCError("NOT_FOUND", { message: error.message })
  }

  throw error
}
