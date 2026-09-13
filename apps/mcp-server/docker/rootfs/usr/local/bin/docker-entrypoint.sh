#!/bin/sh

# --enable-source-maps resolves production stack traces back to original TypeScript source.
NODE_OPTIONS="--no-node-snapshot --enable-source-maps" CHATBOTX_MCP_HOST=${CHATBOTX_MCP_HOST:-0.0.0.0} CHATBOTX_MCP_PORT=${CHATBOTX_MCP_PORT:-3333} node apps/mcp-server/dist/index.mjs;
