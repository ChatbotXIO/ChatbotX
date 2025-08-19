"use client"

import { TolgeeProvider, type TolgeeStaticData } from "@tolgee/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { TolgeeBase } from "./shared"

type Props = {
  language: string
  staticData: TolgeeStaticData
  children: React.ReactNode
}

const tolgee = TolgeeBase().init()

export const TolgeeNextProvider = ({
  language,
  staticData,
  children,
}: Props) => {
  const router = useRouter()

  // biome-ignore lint: use-exhaustive-dependencies
  useEffect(() => {
    // this ensures server components refresh, after translation change
    const { unsubscribe } = tolgee.on("permanentChange", () => {
      router.refresh()
    })
    return () => unsubscribe()
  }, [tolgee, router])

  return (
    <TolgeeProvider
      fallback="Loading"
      ssr={{ language, staticData }}
      tolgee={tolgee}
    >
      {children}
    </TolgeeProvider>
  )
}
