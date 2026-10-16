import type { Argv } from "yargs"
import type { CliParamValue } from "./dynamic-executor"
import type { DynamicTool } from "./openapi-loader"

const isQueryArrayParam = (tool: DynamicTool, name: string): boolean =>
  tool.queryParamNames.includes(name) &&
  (tool.inputSchema.properties[name] as { type?: string } | undefined)?.type ===
    "array"

export const registerActionArgs = (
  actionCli: Argv,
  tool: DynamicTool,
): Argv => {
  // Positional path params are declared in the command string itself,
  // so we only register them here via .positional() for description/type.
  let next = actionCli
  for (const name of tool.pathParamNames) {
    next = next.positional(name, {
      describe: name,
      type: "string",
      demandOption: true,
    })
  }
  for (const name of [...tool.queryParamNames, ...tool.bodyParamNames]) {
    const required = tool.inputSchema.required?.includes(name) ?? false
    next = next.option(name, {
      describe: name,
      type: "string",
      demandOption: required,
      // A query array (`--channels messenger --channels whatsapp`) is repeated
      // flags, collected into one list. Body arrays stay a JSON string.
      ...(isQueryArrayParam(tool, name) ? { array: true } : {}),
    })
  }
  return next
}

/** Picks a command's path, query and body values out of parsed argv. */
export const collectCliParams = (
  tool: DynamicTool,
  argv: Record<string, unknown>,
): Record<string, CliParamValue> => {
  const params: Record<string, CliParamValue> = {}
  for (const name of [
    ...tool.pathParamNames,
    ...tool.queryParamNames,
    ...tool.bodyParamNames,
  ]) {
    const value = argv[name]
    if (typeof value === "string") {
      params[name] = value
    } else if (isQueryArrayParam(tool, name) && Array.isArray(value)) {
      const items = value.map(String)
      if (items.length > 0) {
        params[name] = items
      }
    }
  }
  return params
}
