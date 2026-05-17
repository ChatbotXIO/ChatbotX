export type FileToolId = `file:${string}`
export type FncToolId = `fnc:${string}`
export type McpToolId = `mcp:${string}`
export type SysToolId = `sys:${string}`

export type ToolId = FileToolId | FncToolId | McpToolId | SysToolId

export const fileToolId = (id: string): FileToolId => `file:${id}`
export const fncToolId = (id: string): FncToolId => `fnc:${id}`
export const mcpToolId = (id: string): McpToolId => `mcp:${id}`
export const sysToolId = (id: string): SysToolId => `sys:${id}`
