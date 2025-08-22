import { NextResponse } from "next/server"

export async function GET() {
  try {
    // You can add more health checks here (database, redis, etc.)
    return NextResponse.json(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "builder",
      },
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        service: "builder",
      },
      { status: 500 },
    )
  }
}
