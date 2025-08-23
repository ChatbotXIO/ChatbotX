import { NextResponse } from "next/server"

export function GET() {
  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "builder",
  })
}
