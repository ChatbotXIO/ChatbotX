"use client"

import { useEffect, useState } from "react"
import { authClient } from "@/lib/auth/auth-client"

export default function TestPage() {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    authClient.token().then(({ data, error }) => {
      setToken(data?.token ?? null)
      setError(error?.message ?? null)
    })
  }, [])

  return (
    <div>
      <div>Error: {JSON.stringify(error)}</div>
      <div>Token: {token}</div>
    </div>
  )
}
