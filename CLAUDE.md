# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript monorepo containing npm packages that enhance the Notion API with developer-friendly wrappers and utilities. The main packages are `@yubrot/notion-flexible-blocks` (core API wrapper) and `@yubrot/notion-markdown` (markdown-to-Notion conversion).

## Development Commands

### Essential Commands
- `pnpm install` - Install all workspace dependencies
- `pnpm build` - Build all packages
- `pnpm test` - Run all tests across packages
- `pnpm test:coverage` - Run tests with coverage
- `pnpm lint` - Check code quality
- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm format` - Format code with Prettier

### Package-Specific Commands
Each package supports `build`, `test`, and `test:coverage` individually.

## Architecture

### Core Packages
- **notion-flexible-blocks**: Core library providing block abstraction over Notion API
  - `src/flexible-block.ts` - Main abstraction layer
  - `src/execute.ts` - API execution with batching and retry logic
  - `src/plan.ts` - Execution planning
  - `src/block.ts` - Block type definitions
  - `src/inline.ts` - Inline content handling

- **notion-markdown**: Markdown-to-Notion conversion built on flexible-blocks
  - `src/translate.ts` - Core conversion logic using unified/remark

### Key Architectural Patterns
- All packages are pure ESM with TypeScript
- Uses composite TypeScript builds for incremental compilation
- Flexible blocks can contain both blocks and inline content
- Automatic API batching and retry mechanisms
- Workspace dependencies use `workspace:*` protocol

### Testing
- Uses Vitest for testing framework
- Coverage reports with `@vitest/coverage-v8`
- Tests are located alongside source files

### Code Quality
- ESLint with TypeScript support using flat config
- Prettier for formatting
- Strict TypeScript configuration with ES2022 target