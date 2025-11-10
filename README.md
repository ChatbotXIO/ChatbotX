# Aha.Chat

This is offical source code for Aha.Chat

### Prerequisites

This project is 99.99% NodeJS/TypeScript.

- nodejs: v24
- corepack enable
- package manager: pnpm
- docker & docker-composer

### How to run project

This project is using docker to boost up development experience.

```
# start development
docker compose up -d

# install latest corepack
npm install -g corepack@latest

# use pnpm as package manager
corepack enable pnpm

# install dependencies
pnpm install

# copy environments
cp .env.example .env

# run migration and seed data
pnpm turbo db:migrate && turbo db:seed

# start the dev server and enjoy the moment
pnpm turbo dev
```

The seeder makes default user `demo@aha.chat | Ahachat@1234`

### Folder structure

This project is Modern Monorepo with Turborepo
```
.
├── apps
│   ├── builder
│   ├── partysocket
│   └── worker
├── biome.json
├── docker-compose.yml
├── integrations
│   ├── google-sheets
│   ├── openai
│   └── whatsapp
├── package.json
├── packages
│   ├── database
│   ├── filesystem
│   ├── sdk
│   ├── typescript-config
│   ├── ui
│   └── worker-config
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── turbo.json
```
