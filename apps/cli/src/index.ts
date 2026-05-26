import type { Argv } from "yargs"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { setConfig } from "./commands/config"
import type { ConfigOptions } from "./config"
import { getConfig } from "./config"
import { executeDynamicCommand } from "./dynamic-executor"
import { type DynamicTool, loadOpenApiSpecForCli } from "./openapi-loader"

const registerActionArgs = (actionCli: Argv, tool: DynamicTool): Argv => {
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
    })
  }
  return next
}

const buildActionCommandString = (
  action: string,
  tool: DynamicTool,
): string => {
  const positionals = tool.pathParamNames.map((p) => `<${p}>`).join(" ")
  return positionals ? `${action} ${positionals}` : action
}

const buildActionHandler =
  (tool: DynamicTool, config: { apiKey: string; apiUrl: string }) =>
  async (argv: Record<string, unknown>): Promise<void> => {
    const params: Record<string, string> = {}
    for (const name of [
      ...tool.pathParamNames,
      ...tool.queryParamNames,
      ...tool.bodyParamNames,
    ]) {
      const value = argv[name]
      if (typeof value === "string") {
        params[name] = value
      }
    }
    await executeDynamicCommand(tool, params, config)
  }

const registerGroupCommand = (
  cli: ReturnType<typeof yargs>,
  groupName: string,
  actions: Record<string, { tool: DynamicTool; name: string }>,
  config: { apiKey: string; apiUrl: string },
): void => {
  cli.command(groupName, `${groupName} commands`, (groupCli: Argv) => {
    for (const [actionName, { tool, name }] of Object.entries(actions)) {
      const commandStr = buildActionCommandString(actionName, tool)
      groupCli.command(
        commandStr,
        name,
        (actionCli: Argv) => registerActionArgs(actionCli, tool),
        async (argv) =>
          buildActionHandler(tool, config)(argv as Record<string, unknown>),
      )
    }
    return groupCli.demandCommand(1, "You need at least one action")
  })
}

const registerConfigCommand = (cli: ReturnType<typeof yargs>): void => {
  cli.command(
    "config",
    "Configuration commands",
    (configCli: Argv<ConfigOptions>) =>
      configCli
        .command(
          "set",
          "Set or update API key and API URL",
          (setCli: Argv<ConfigOptions>) =>
            setCli
              .option("apiKey", {
                describe: "ChatbotX API key",
                type: "string",
              })
              .option("apiUrl", {
                describe: "ChatbotX API URL",
                type: "string",
              })
              .option("allowSelfSignedCert", {
                describe: "Disable TLS cert validation (local dev only)",
                type: "boolean",
              }),
          (argv) => {
            setConfig(argv as Parameters<typeof setConfig>[0] & ConfigOptions)
          },
        )
        .demandCommand(1, "You need at least one action"),
  )
}

const toolsToCommands = (
  tools: DynamicTool[],
  _config: { apiKey: string; apiUrl: string },
): Record<string, Record<string, { tool: DynamicTool; name: string }>> => {
  const grouped: Record<
    string,
    Record<string, { tool: DynamicTool; name: string }>
  > = {}

  for (const tool of tools) {
    const colonIndex = tool.commandName.indexOf(":")
    const group = tool.commandName.slice(0, colonIndex)
    const action = tool.commandName.slice(colonIndex + 1)

    if (!grouped[group]) {
      grouped[group] = {}
    }

    grouped[group][action] = { tool, name: tool.description }
  }

  return grouped
}

const main = async (): Promise<void> => {
  const cli = yargs(hideBin(process.argv))
    .scriptName("chatbotx")
    .usage("$0 <group> <action> [options]")
    .option("apiKey", {
      describe: "ChatbotX API key (global)",
      type: "string",
      global: true,
    })
    .option("apiUrl", {
      describe: "ChatbotX API URL (global)",
      type: "string",
      global: true,
    })
    .option("allowSelfSignedCert", {
      describe: "Disable TLS cert validation (local dev only)",
      type: "boolean",
      global: true,
    })
    .option("refresh-spec", {
      describe: "Force refresh the cached OpenAPI spec",
      type: "boolean",
      global: true,
      default: false,
    })

  registerConfigCommand(cli)

  // Read flags directly from process.argv to avoid a second yargs instance
  // that would intercept --help and exit before commands are registered.
  const rawArgs = process.argv.slice(2)
  const readFlag = (name: string): string | undefined => {
    const idx = rawArgs.indexOf(`--${name}`)
    return idx !== -1 && idx + 1 < rawArgs.length ? rawArgs[idx + 1] : undefined
  }
  const configOverrides: ConfigOptions = {
    apiKey: readFlag("apiKey"),
    apiUrl: readFlag("apiUrl"),
  }
  const forceRefresh = rawArgs.includes("--refresh-spec")

  let config: { apiKey: string; apiUrl: string }
  try {
    config = getConfig(configOverrides)
  } catch {
    // Config not set yet — only config command will work
    await cli
      .demandCommand(1, "You need at least one command")
      .help()
      .alias("h", "help")
      .version("0.1.0")
      .alias("v", "version")
      .parseAsync()
    return
  }

  const tools = await loadOpenApiSpecForCli(config.apiUrl, forceRefresh)
  const grouped = toolsToCommands(tools, config)

  for (const [groupName, actions] of Object.entries(grouped)) {
    registerGroupCommand(cli, groupName, actions, config)
  }

  await cli
    .demandCommand(1, "You need at least one command")
    .help()
    .alias("h", "help")
    .version("0.1.0")
    .alias("v", "version")
    .parseAsync()
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown CLI error"
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
