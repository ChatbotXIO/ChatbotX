# AhaChat.ai

This is offical source code for AhaChat.ai

### Prerequisites

This project is 99.99% NodeJS/TypeScript.

- nodejs: v22
- corepack enable
- package manager: pnpm
- docker & docker-composer

### How to run project

This project is using docker to boost up development experience.

```
# start development
docker compose up -d

# make sure corepack is enabled
corepack enable

# switch to nodejs version
pnpm env use --global 22

# install dependencies
pnpm install

# copy environments
cp .env.example .env

# run migration and seed data
turbo db:migrate && turbo db:seed

# start the dev server and enjoy the moment
turbo dev
```

The seeder mad default user `admin@ahachat.ai` with email provider

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
