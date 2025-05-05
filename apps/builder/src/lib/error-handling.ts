import { NextResponse } from "next/server"
import { z } from "zod"

export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    const errors = error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }))

    return NextResponse.json(
      {
        errors,
      },
      {
        status: 422,
      },
    )
  }

  if (error instanceof Error) {
    return NextResponse.json(
      {
        errors: [
          {
            message: error.message,
          },
        ],
      },
      {
        status: 400,
      },
    )
  }

  return NextResponse.json(
    {
      errors: [
        {
          message: "Unknow error",
        },
      ],
    },
    {
      status: 500,
    },
  )
}
