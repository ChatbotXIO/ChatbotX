import type { ArgumentsCamelCase } from "yargs"
import { setAllowSelfSignedCert, setApiKey, setApiUrl } from "../config"

type ConfigSetArgs = {
  apiKey?: string
  apiUrl?: string
  allowSelfSignedCert?: boolean
}

export const setConfig = (argv: ArgumentsCamelCase<ConfigSetArgs>): void => {
  const apiKey = typeof argv.apiKey === "string" ? argv.apiKey : undefined
  const apiUrl = typeof argv.apiUrl === "string" ? argv.apiUrl : undefined
  const allowSelfSignedCert =
    typeof argv.allowSelfSignedCert === "boolean"
      ? argv.allowSelfSignedCert
      : undefined

  if (!(apiKey || apiUrl || allowSelfSignedCert !== undefined)) {
    throw new Error(
      "Provide at least one option: --apiKey, --apiUrl, or --allowSelfSignedCert",
    )
  }

  if (apiKey) {
    setApiKey(apiKey)
  }

  if (apiUrl) {
    setApiUrl(apiUrl)
  }

  if (allowSelfSignedCert !== undefined) {
    setAllowSelfSignedCert(allowSelfSignedCert)
  }

  const saved: string[] = []

  if (apiKey) {
    saved.push("apiKey")
  }

  if (apiUrl) {
    saved.push("apiUrl")
  }

  if (allowSelfSignedCert !== undefined) {
    saved.push("allowSelfSignedCert")
  }

  process.stdout.write(`Config saved: ${saved.join(", ")}.\n`)
}
