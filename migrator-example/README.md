# migrator-example

This example demonstrates how to migrate all documents from another knowledge database to Notion.

## Try it

```
mise trust
docker compose up -d
npx prisma migrate dev
pnpm run migrator -h
pnpm run migrator migrate example-docs
```
