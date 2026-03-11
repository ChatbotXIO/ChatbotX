import type { ArgumentsCamelCase } from "yargs"
import { setApiKey } from "../config"

type ConfigSetArgs = {
  apiKey: string
}

export const setConfig = (argv: ArgumentsCamelCase<ConfigSetArgs>): void => {
  setApiKey(argv.apiKey)
  process.stdout.write("✅ API key saved.\n")
}
