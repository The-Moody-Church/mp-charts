# AGENTS.md - MPNext Development Guide

## Commands
- **Dev**: `pnpm dev` (Next.js dev server)
- **Build**: `pnpm build` (production build, runs type checking)
- **Lint**: `pnpm lint` (ESLint)
- **Generate MP Types**: `pnpm mp:generate:models` (generates Zod schemas and types from Ministry Platform API)
- **Tests**: No test framework configured yet

## Architecture
- **Framework**: Next.js 15 (App Router) with React 19, TypeScript strict mode
- **Ministry Platform Integration**: Custom provider at `src/lib/providers/ministry-platform/` with REST API client, auth, and type-safe models
- **Auth**: NextAuth v5 (beta) with Ministry Platform OAuth provider (`src/auth.ts`)
- **UI**: Radix UI primitives + shadcn/ui components in `src/components/ui/`, Tailwind CSS v4
- **Path Alias**: `@/*` maps to `src/*`

## Code Style
- **Imports**: Use `@/` alias for all internal imports
- **Components**: React Server Components by default, "use client" only when needed for interactivity
- **Types**: TypeScript interfaces exported from models, Zod schemas for validation
- **Naming**: PascalCase for components/types, camelCase for functions/variables, snake_case for Ministry Platform API fields
- **UI Components**: Keep in `src/components/ui/` following shadcn conventions
- **Ministry Platform Models**: Export from `src/lib/providers/ministry-platform/models/index.ts`
