# migrator-example

This example demonstrates how to migrate all documents from another knowledge database to Notion.

The result of this example can be seen on [the published site](https://plum-throne-667.notion.site/migrator-example-1edb53d5317a80cb96f9f5eb72cb0a59).

## Try it

```
mise trust
docker compose up -d
npx prisma migrate dev
pnpm run migrator -h
pnpm run migrator migrate example-docs
pnpm run migrator migrate example-docs -p 4   # full migration in concurrent
pnpm run migrator migrate example-docs        # nothing to do
```
