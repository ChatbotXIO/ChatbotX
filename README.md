# AhaChat.ai

This is offical source code for AhaChat.ai

### Prerequisites

This project is 99.99% NodeJS/TypeScript.

Required versions:
- nodejs: v22
- package manager: pnpm

### How to run project

This project is using docker to boost up development experience.

```
# start development
docker compose up -d

# switch to nodejs version
nvm use

# install dependencies
pnpm install

# copy environments
cp .env.example .env

# run migration
turbo db:migrate

# start the dev server and enjoy the moment
turbo dev

# login to create new user

# run seeder for first user
turbo db:seed
```

### Folder structure

This project is Modern Monorepo with Turborepo

