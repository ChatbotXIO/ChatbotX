import { NextResponse } from "next/server"
import { z } from "zod"
import { ChatbotXException } from "./exception"

export function serverErrorHandler(error: unknown) {
  if (error instanceof z.ZodError) {
    const errors = error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }))

    return NextResponse.json(
      { message: "Validation error", errors },
      { status: 422 },
    )
  }

  if (error instanceof ChatbotXException) {
    return NextResponse.json(
      { message: error.message, errors: [] },
      { status: error.httpStatusCode },
    )
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { message: error.message, errors: [] },
      { status: 400 },
    )
  }

  return NextResponse.json(
    { message: "Unknown error", errors: [] },
    { status: 500 },
  )
}
