<p align="center">
  <a href="https://github.com/ChatbotXIO/ChatbotX" target="_blank" rel="noopener">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/chatbotx-logo-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset=".github/assets/readme/chatbotx-logo-light.svg">
      <img alt="ChatbotX Logo" src=".github/assets/readme/chatbotx-logo-light.svg" width="280">
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://opensource.org/license/agpl-v3">
    <img alt="License" src="https://img.shields.io/badge/License-AGPL%203.0-2496ED?labelColor=111827">
  </a>
</p>

<p align="center">
  <strong>Open-source omnichannel chatbot for agentic workflows via APIs, CLI, and MCP.</strong>
  <br>
  An alternative to Wati, ManyChat, Chatfuel and Respond.io.
</p>

<p align="center">
  <a href="https://chatbotx.io/">Website</a>
  |
  <a href="https://chatbotx.canny.io/">Roadmap</a>
  |
  <a href="https://chatbotx.io/coming-soon/">Cloud</a>
  |
  <a href="https://chatbotx.io/docs">Docs</a>
  |
  <a href="https://discord.chatbotx.io/">Discord</a>
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-111827?logo=nextdotjs&logoColor=white">
  <img alt="Turborepo" src="https://img.shields.io/badge/Turborepo-EF4444?logo=turborepo&logoColor=white">
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white">
  <img alt="Redis" src="https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white">
  <img alt="MCP" src="https://img.shields.io/badge/MCP-111827">
</p>

<p align="center">
  <img alt="WhatsApp" src=".github/assets/readme/whatsapp.svg" width="32">
  <img alt="Messenger" src=".github/assets/readme/messenger.svg" width="32">
  <img alt="Instagram" src=".github/assets/readme/instagram.svg" width="32">
  <img alt="Telegram" src=".github/assets/readme/telegram.svg" width="32">
  <img alt="Zalo" src=".github/assets/readme/zalo.svg" width="32">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme/tiktok-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset=".github/assets/readme/tiktok-light.svg">
    <img alt="TikTok" src=".github/assets/readme/tiktok-light.svg" width="32">
  </picture>
  <img alt="Email" src=".github/assets/readme/email.svg" width="32">
  <img alt="Website" src=".github/assets/readme/website.svg" width="32">
</p>

<p align="center">
  <img alt="ChatbotX omnichannel AI chatbot hero" src=".github/assets/readme/chatbotx-hero.png">
</p>

## ✨ Features

- **Visual Flow Builder:** Drag-and-drop chatbot builder with 15+ node types
- **AI Agent:** AI-powered responses and actions using OpenAI, DeepSeek, or Gemini
- **Live Chat Inbox:** Real-time inbox with human takeover and conversation assignment
- **Contact CRM:** Manage contacts with tags, custom fields, and segmentation
- **Broadcasting:** Send targeted messages to specific contact segments
- **Sequences:** Automate drip campaigns with scheduled messages and auto-enrollment
- **Team Management:** Invite team members, assign roles, and manage permissions
- **Multi-Platform:** Connect across WhatsApp, Facebook, Instagram, Telegram, Zalo, Email, and Webchat
- **Rich Messaging:** Support for buttons, quick replies, catalogs, and carousel cards
- **Comment-to-DM:** Automatically message users who comment with specific keywords
- **A/B Testing:** Test and optimize different message flows
- **Triggers:** Execute actions based on events within your bot
- **Webhooks & HTTP:** Integrate external APIs directly into your flows
- **Growth Tools:** Generate conversation starter links for each platform
- **Analytics:** Track performance metrics, user engagement, and campaign results
- **APIs, CLI, and MCP:** Build advanced agent workflows with MCP-compatible clients

| ![Omnichannel Team Inbox](https://github.com/user-attachments/assets/daa23e91-7ba5-4093-8605-e77cddebe35c) | ![Smart Contact Import](https://github.com/user-attachments/assets/6a4a6c7d-5a77-4f3c-900b-d87cb849e589) |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ![Visual Flow Builder](https://github.com/user-attachments/assets/6f0448ad-0f32-4065-9e2a-f41b5354a68f) | ![Built-in AI Agents](https://github.com/user-attachments/assets/365167c6-b4d9-498a-8b8c-a5079b82edbf) |

## Tech Stack

- Node.js 24
- TypeScript 5
- pnpm 10 workspaces
- Turborepo
- Next.js 16 and React 19 for `apps/builder`
- PartyKit / PartySocket for realtime messaging
- Drizzle ORM with PostgreSQL and pgvector
- Redis and BullMQ for queues and worker coordination
- RustFS / S3-compatible storage for uploaded assets
- Docker Compose for local infrastructure

## Quick Start

To have the project up and running, please follow the [Quick Start Guide](https://chatbotx.io/docs/quickstart).

## Project Structure

```text
.
|-- apps/
|   |-- builder/       # Next.js web app and product builder
|   |-- worker/        # background workers for chat, AI, triggers, webhooks, analytics, sequences
|   |-- partysocket/   # realtime server
|   |-- cli/           # ChatbotX command line client
|   `-- mcp-server/    # MCP server backed by public APIs
|-- integrations/
|   |-- whatsapp/
|   |-- messenger/
|   |-- instagram/
|   |-- telegram/
|   |-- zalo/
|   |-- webchat/
|   |-- smtp/
|   |-- openai/
|   `-- google-sheets/
|-- packages/
|   |-- database/
|   |-- ai/
|   |-- analytics/
|   |-- public-apis/
|   |-- sdk/
|   |-- scheduler/
|   |-- sequence-scheduler/
|   |-- ui/
|   `-- worker-config/
|-- docker-compose.yml
|-- pnpm-workspace.yaml
`-- turbo.json
```

## Development Commands

```bash
pnpm dev              # run turbo dev
pnpm build            # build all packages/apps through Turborepo
pnpm lint             # run Ultracite lint
pnpm fix              # run Ultracite fix
pnpm check:circular   # check circular dependencies
pnpm check:unused     # check unused files and dependencies
```

Useful package-level commands:

```bash
pnpm --filter builder dev
pnpm --filter worker dev
pnpm --filter partysocket dev
pnpm --filter chatbotx-cli dev:cli
pnpm --filter chatbotx-mcp-server dev:mcp
pnpm --filter @chatbotx.io/database db:studio
```

## Services

The default Docker Compose stack includes:

- PostgreSQL with pgvector on `5432`
- Redis on `6379`
- RedisInsight on `5540`
- RustFS object storage on `9000` and console on `9001`
- MailHog SMTP on `1025` and UI on `8025`
- Adminer on `8080`

## License

ChatbotX' Community Edition is released as open source under the [AGPLv3 license](https://github.com/ChatbotXIO/ChatbotX/blob/main/LICENSE) and enterprise features are released under [Commercial License](https://github.com/ChatbotXIO/ChatbotX/blob/main/apps/builder/src/enterprise/LICENSE)
