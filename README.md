# MPNext

A modern Next.js application integrated with Ministry Platform authentication and REST API, built with TypeScript, Next.js 16, React 19, and Better Auth.

> **Fork Notice**: This repository ([The-Moody-Church/mp-charts](https://github.com/The-Moody-Church/mp-charts)) is a fork of [MinistryPlatform-Community/MPNext](https://github.com/MinistryPlatform-Community/MPNext). We pull in changes from upstream but do not contribute back. All development happens on this fork.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [Quick Setup](#quick-setup)
  - [Manual Setup](#manual-setup)
  - [API Client Setup](#api-client-setup)
- [Project Structure](#project-structure)
- [Ministry Platform Integration](#ministry-platform-integration)
- [Components](#components)
- [Services](#services)
- [Testing](#testing)
- [Development](#development)
- [Claude Code Commands](#claude-code-commands)
- [Documentation](#documentation)
- [Code Style & Conventions](#code-style--conventions)

## Features

- **Authentication**: Better Auth with Ministry Platform OAuth via `genericOAuth` plugin and OIDC RP-initiated logout
- **RBAC**: Admin-managed feature-to-User-Group mapping with per-feature access control
- **Modern UI**: Radix UI primitives + shadcn/ui components with Tailwind CSS v4
- **PWA**: Service worker, offline fallback, and iOS install prompt
- **Type-Safe API**: Full TypeScript support with auto-generated types from Ministry Platform schema
- **Next.js 16**: App Router with Cache Components (PPR), Turbopack, and React Server Components
- **REST API Client**: Comprehensive Ministry Platform REST API integration
- **Type Generation**: CLI tool to generate TypeScript interfaces and Zod schemas from MP database
- **Validation**: Zod v4 schema validation in MPHelper for runtime data validation before API calls
- **Testing**: Vitest test framework with coverage for auth, proxy, rate limiting, authorization, and API services
- **Executive Dashboard**: Attendance metrics, community trends, small group analytics with YoY comparisons
- **Contact Lookup**: Scored search with exact/starts-with/contains/Soundex/Levenshtein matching
- **Manage Members**: Card-based membership management with status tabs, scored search, detail modal with expandable milestones, deep links, optimistic status transitions
- **Journey & Compliance Processing**: Configurable multi-step processing workflows (volunteer, baptism, membership)
- **Cache Warming**: Automatic pre-warming of all cached data on server start

## Architecture

### Framework
- **Next.js 16** with App Router, Cache Components (PPR), and Turbopack
- **React 19** with Server Components by default
- **TypeScript** in strict mode
- **Tailwind CSS v4** for styling
- **Vitest** for testing

### Ministry Platform Integration
Custom provider located at `src/lib/providers/ministry-platform/` featuring:
- REST API client with OAuth2 authentication
- Service-oriented architecture for domain-specific logic
- Type-safe models and Zod validation schemas (auto-generated)
- Automatic token management with refresh
- Six specialized services: Table, Procedure, Communication, File, Metadata, Domain

### Authentication
Better Auth (`better-auth@^1.4`) with Ministry Platform OAuth via `genericOAuth` plugin:
- **Server config**: `src/lib/auth.ts` — `betterAuth()` with `genericOAuth`, `customSession`, `nextCookies()` plugins
- **Client config**: `src/lib/auth-client.ts` — `createAuthClient()` with matching client plugins
- **Auth helpers**: `src/lib/auth-helpers.ts` — `getSession()`, `requireSession()`, `getMpUserId()`, `getUserGuid()`
- **Route handler**: `src/app/api/auth/[...all]/route.ts` — Better Auth API route
- **Route protection**: `src/proxy.ts` — Next.js 16 proxy with session cookie validation
- JWT cookie-based sessions; OIDC RP-initiated logout for proper session termination

### Authorization (RBAC)
Feature access is controlled via admin-managed User Group mappings:
- Configuration stored in `data/feature-access.json`
- Super-admin groups defined by `ADMIN_USER_GROUP_IDS` env var
- Server actions enforce access via `requireFeatureAccess()`
- Admin page at `/admin` for managing feature-to-group assignments

## Prerequisites

- **Node.js**: v22 or higher (v20.9+ minimum, v22 LTS recommended)
- **Package Manager**: npm (comes with Node.js)
- **Ministry Platform**: Active instance with API credentials and OAuth client configured (see [API Client Setup](#api-client-setup))

## Getting Started

### Quick Setup

The interactive setup command automates environment configuration:

```bash
git clone https://github.com/The-Moody-Church/mp-charts.git
cd mp-charts
npm install
npm run setup
```

The setup command will:
1. Verify Node.js version (v20.9+ required, v22 LTS recommended)
2. Check git status
3. Create `.env.local` from `.env.example` (if needed)
4. Prompt for missing environment variables
5. Auto-generate `BETTER_AUTH_SECRET` (optional)
6. Install and update dependencies
7. Generate Ministry Platform types
8. Run a production build to verify configuration

**Additional setup options:**
```bash
npm run setup:check            # Validation only (no changes)
npm run setup -- --clean       # Clean install (delete node_modules first)
npm run setup -- --skip-install # Skip npm install/update
npm run setup -- --verbose     # Extra output
npm run setup -- --help        # Show all options
```

Once setup completes, run `npm run dev` and visit http://localhost:3000.

---

### Manual Setup

#### 1. Clone the Repository

```bash
git clone https://github.com/The-Moody-Church/mp-charts.git
cd mp-charts
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Environment Configuration

Copy the example environment file and configure it with your Ministry Platform credentials:

```bash
cp .env.example .env.local
```

Update `.env.local` with your configuration:

```env
# Better Auth / OAuth Configuration
OIDC_CLIENT_ID=TM.Widgets
OIDC_CLIENT_SECRET=your_client_secret

# Generate via: openssl rand -base64 32
BETTER_AUTH_SECRET=your_generated_secret

# Application base URL — used for OAuth callbacks and redirects
BETTER_AUTH_URL=http://localhost:3000

# MinistryPlatform API Configuration
MINISTRY_PLATFORM_CLIENT_ID=MPNext
MINISTRY_PLATFORM_CLIENT_SECRET=your_client_secret
MINISTRY_PLATFORM_BASE_URL=https://your-instance.ministryplatform.com/ministryplatformapi

# Public Keys
NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL=https://your-instance.ministryplatform.com/ministryplatformapi/files
NEXT_PUBLIC_APP_NAME=MP Tools

# RBAC Configuration — super-admin User Group IDs (comma-separated)
ADMIN_USER_GROUP_IDS=29
```

#### API Client Setup

Before running the application, you must configure an OAuth 2.0 / OpenID Connect (OIDC) client in Ministry Platform.

Log in to your Ministry Platform instance as an administrator and navigate to **Administration > API Clients**.

Create a new API Client with the following configuration:

##### Basic Settings
- **Client ID**: `MPNext` (or your custom client ID)
- **Client Secret**: Generate a secure secret (save this securely - you'll need it for `.env.local`)
- **Display Name**: `MPNext` (or your preferred name)
- **Client User**: Create a scoped user or use API User
- **Authentication Flow**: use the default: Authorization Code, Implicit, Hybrid, Client Credentials, or Resource Owner

##### Redirect URIs (Required)
Add these authorized redirect URIs where users will be sent after authentication - separate each entry by ending with a semi-colon(;):

**Development:**
```
http://localhost:3000/api/auth/oauth2/callback/ministryplatform
```

**Production:**
```
https://yourdomain.com/api/auth/oauth2/callback/ministryplatform
```

> **Important**: The redirect URI must match exactly (including protocol, domain, port, and path). Ministry Platform will reject any OAuth requests with mismatched redirect URIs.

##### Post-Logout Redirect URIs (Required)
Add these URIs where users will be redirected after signing out:

**Development:**
```
http://localhost:3000
```

**Production:**
```
https://yourdomain.com
```

> **Important**: Post-logout redirect URIs are **required** for proper logout functionality. The application implements OIDC RP-initiated logout to properly end Ministry Platform OAuth sessions. Without these configured, users will be auto-logged back in after clicking "Sign out" (SSO behavior).

#### Generate Better Auth Secret

Generate a secure secret for Better Auth session encryption:

```bash
openssl rand -base64 32
```

Copy the generated secret to your `.env.local` file as `BETTER_AUTH_SECRET`.


### 4. Generate Ministry Platform Types

Before running the application, generate TypeScript types from your Ministry Platform database schema:

```bash
npm run mp:generate:models
```

This will:
- Connect to your Ministry Platform API
- Fetch all table metadata (301+ tables)
- Generate TypeScript interfaces for each table
- Generate Zod validation schemas for runtime validation
- Generate schema documentation with type file links
- Clean up any previously generated files
- Output to `src/lib/providers/ministry-platform/models/`

**Advanced options:**
```bash
# Generate types for specific tables only
npx tsx src/lib/providers/ministry-platform/scripts/generate-types.ts -s "Contact"

# Generate without Zod schemas
npx tsx src/lib/providers/ministry-platform/scripts/generate-types.ts -o ./types

# Generate with detailed mode (samples records for better type inference)
npx tsx src/lib/providers/ministry-platform/scripts/generate-types.ts -d --sample-size 10

# See all options
npx tsx src/lib/providers/ministry-platform/scripts/generate-types.ts --help
```

> **Note**: Field names containing special characters (like `Allow_Check-in`) are automatically quoted in the generated types for valid TypeScript syntax.

### 5. Run the Development Server

Start the development server and test the authentication flow:

```bash
npm run dev
```

1. Navigate to [http://localhost:3000](http://localhost:3000)
2. Click "Sign In"
3. You should be redirected to Ministry Platform login
4. After successful login, you'll be redirected back to the application
5. Your session should be active

**Troubleshooting:**
- **"Redirect URI mismatch"**: Verify redirect URI in MP matches exactly
- **"Invalid client"**: Check client ID and secret are correct
- **"Unauthorized scope"**: Ensure all required scopes are enabled
- **Auto-login after logout**: Verify post-logout redirect URIs are configured in Ministry Platform OAuth client. The application requires these for proper OIDC logout (see [OAUTH_LOGOUT_SETUP.md](docs/OAUTH_LOGOUT_SETUP.md))


### Production Deployment

When deploying to production:

1. Update `BETTER_AUTH_URL` to your production domain
2. Add production redirect URIs to Ministry Platform OAuth client
3. Add production post-logout redirect URIs
4. Ensure environment variables are set in your hosting provider
5. Enable HTTPS/SSL certificates
6. Test the complete authentication flow in production environment

For Docker-based deployments, see **[DOCKER.md](DOCKER.md)**.

## Project Structure

```
mp-charts/
├── src/
│   ├── app/                              # Next.js App Router pages
│   │   ├── (web)/                        # Protected route group
│   │   │   ├── admin/                   # Admin settings (RBAC, feature access)
│   │   │   ├── compliance/              # Compliance processing tools
│   │   │   ├── contact-lookup/          # Contact search & detail pages
│   │   │   │   └── [guid]/             # Dynamic contact detail page
│   │   │   ├── dashboard/              # Executive dashboard
│   │   │   ├── manage-members/        # Membership management
│   │   │   ├── home/                   # Home redirect
│   │   │   ├── journey/               # Journey processing tools
│   │   │   ├── layout.tsx              # Web layout with auth
│   │   │   └── page.tsx               # Root page (feature cards)
│   │   ├── api/
│   │   │   ├── auth/[...all]/          # Better Auth API route
│   │   │   └── cache-warm/            # Cache warming endpoint
│   │   ├── signin/                     # Sign-in page
│   │   ├── layout.tsx                  # Root layout
│   │   └── providers.tsx               # App providers wrapper
│   │
│   ├── components/                      # React components
│   │   ├── admin/                       # Admin UI (journey-tools, compliance-tools editors)
│   │   ├── compliance-processing/       # Compliance processing feature
│   │   ├── contact-logs/                # Contact logs feature (CRUD)
│   │   ├── contact-lookup/              # Contact search with scored matching
│   │   ├── contact-lookup-details/      # Detailed contact view
│   │   ├── dashboard/                   # Executive dashboard charts & metrics
│   │   ├── manage-members/             # Membership status management
│   │   ├── feedback/                    # User feedback feature
│   │   ├── home/                        # Home page cards
│   │   ├── journey-processing/          # Journey processing feature
│   │   ├── layout/                      # Layout components (header, sidebar, breadcrumb)
│   │   ├── processing/                  # Shared processing components (avatar, grid, forms)
│   │   ├── pwa/                         # PWA install prompt
│   │   ├── shared-actions/              # Cross-feature server actions
│   │   ├── ui/                          # shadcn/ui components
│   │   └── user-menu/                   # User menu feature
│   │
│   ├── contexts/                        # React Context providers (User, RuntimeConfig)
│   │
│   ├── lib/                             # Shared libraries
│   │   ├── dto/                         # Application DTOs/ViewModels
│   │   ├── auth.ts                      # Better Auth server configuration
│   │   ├── auth-client.ts               # Better Auth client configuration
│   │   ├── auth-helpers.ts              # Session helpers (requireSession, getMpUserId)
│   │   ├── authorization.ts             # RBAC feature access control
│   │   ├── cache-warming.ts             # Cache warming registry
│   │   ├── processing-utils.ts          # Shared processing utilities
│   │   ├── rate-limit.ts                # Rate limiting (sliding window)
│   │   ├── utils.ts                     # General utilities
│   │   └── providers/
│   │       └── ministry-platform/       # Ministry Platform provider
│   │           ├── auth/                # OAuth authentication
│   │           ├── services/            # API services (6 services)
│   │           ├── models/              # Generated types + Zod schemas
│   │           ├── types/               # Type definitions
│   │           ├── utils/               # HTTP client, filter sanitization
│   │           ├── scripts/             # Type generation CLI
│   │           ├── docs/                # Provider documentation
│   │           ├── helper.ts            # Public API (MPHelper)
│   │           └── index.ts             # Barrel export
│   │
│   ├── services/                        # Application services
│   │   ├── contactService.ts            # Contact search and updates
│   │   ├── contactLogService.ts         # Contact log CRUD
│   │   ├── complianceProcessingService.ts # Compliance workflow processing
│   │   ├── dashboardService.ts          # Executive dashboard metrics
│   │   ├── feedbackService.ts           # User feedback
│   │   ├── journeyProcessingService.ts  # Journey workflow processing
│   │   └── userService.ts               # User profile retrieval
│   │
│   ├── instrumentation.ts              # Cache warming on server start
│   └── proxy.ts                        # Next.js 16 route protection
│
├── data/                                # Runtime data (feature-access.json)
├── .claude/                             # Claude AI configuration
├── docs/                                # Documentation
├── Dockerfile                           # Production Docker build
├── DOCKER.md                            # Docker deployment guide
├── CLAUDE.md                            # Development guide
├── vitest.config.ts                     # Vitest configuration
├── next.config.ts                       # Next.js configuration
└── package.json                         # Dependencies and scripts
```

## Ministry Platform Integration

### MPHelper - Public API

The main entry point for interacting with Ministry Platform:

```typescript
import { MPHelper } from '@/lib/providers/ministry-platform';
import { ContactLogSchema } from '@/lib/providers/ministry-platform/models';

const mp = new MPHelper();

// Get contacts with query parameters
const contacts = await mp.getTableRecords({
  table: 'Contacts',
  filter: 'Contact_Status_ID=1',
  select: 'Contact_ID,Display_Name,Email_Address',
  orderBy: 'Last_Name',
  top: 50
});

// Create records with Zod validation (recommended)
await mp.createTableRecords('Contact_Log', [{
  Contact_ID: 12345,
  Contact_Date: new Date().toISOString(),
  Made_By: 1,
  Notes: 'Follow-up call completed'
}], {
  schema: ContactLogSchema,  // Validates data before API call
  $userId: 1
});

// Update with partial validation (default)
await mp.updateTableRecords('Contact_Log', records, {
  schema: ContactLogSchema,
  partial: true  // Allow partial updates
});

// Execute stored procedures
const results = await mp.executeProcedureWithBody('api_Custom_Procedure', {
  '@ContactID': 12345
});

// File operations
const files = await mp.getFilesByRecord({
  tableName: 'Contacts',
  recordId: 12345
});
```

### Available MP Services

| Service | Purpose | Key Methods |
|---------|---------|-------------|
| **Table Service** | CRUD operations | `getTableRecords`, `createTableRecords`, `updateTableRecords`, `deleteTableRecords` |
| **Procedure Service** | Stored procedures | `getProcedures`, `executeProcedure`, `executeProcedureWithBody` |
| **Communication Service** | Email/SMS | `createCommunication`, `sendMessage` |
| **File Service** | File management | `getFilesByRecord`, `uploadFiles`, `updateFile`, `deleteFile` |
| **Metadata Service** | Schema info | `getTables`, `refreshMetadata` |
| **Domain Service** | Domain config | `getDomainInfo`, `getGlobalFilters` |

### Type Generation

Generate TypeScript interfaces and Zod schemas from your Ministry Platform database schema:

```bash
# Generate types for all tables with Zod schemas (recommended)
npm run mp:generate:models

# Generate types for specific tables
npx tsx src/lib/providers/ministry-platform/scripts/generate-types.ts --search "Contact"

# See all options
npx tsx src/lib/providers/ministry-platform/scripts/generate-types.ts --help
```

**CLI Options:**
- `-o, --output <dir>` - Output directory (default: ./generated-types)
- `-s, --search <term>` - Filter tables by search term
- `-z, --zod` - Generate Zod schemas for runtime validation
- `-c, --clean` - Remove existing files before generating (recommended)
- `-d, --detailed` - Sample records for better type inference (slower)
- `--sample-size <num>` - Number of records to sample in detailed mode

See [Ministry Platform Type Generator documentation](src/lib/providers/ministry-platform/scripts/README.md) for details.

## Components

### UI Components
Built with Radix UI primitives and styled with Tailwind CSS. Located in `src/components/ui/`.

### Layout Components (`src/components/layout/`)
- **AuthWrapper**: Server component for route protection with session validation
- **Header**: Application header with sidebar toggle and user menu
- **Sidebar**: Navigation sidebar with feature-gated route links
- **DynamicBreadcrumb**: Auto-generated breadcrumbs from URL path

### Feature Components
- **contact-lookup**: Contact search with scored fuzzy matching (exact, starts-with, contains, Soundex, Levenshtein), member status badges in results
- **contact-lookup-details**: Detailed contact view with logs, family, photos, membership/group/serving/last-activity badges
- **contact-logs**: Full CRUD for contact interaction history
- **dashboard**: Executive dashboard with attendance, community, and small group charts (YoY comparisons)
- **journey-processing**: Configurable multi-step journey workflows (e.g., volunteer, baptism)
- **manage-members**: Membership status management with card grid, tab filtering, detail modal (expandable milestones with notes/files, deep links, contact actions), optimistic status transitions with cache invalidation
- **compliance-processing**: Configurable compliance tracking workflows (e.g., membership)
- **admin**: Admin tool editors for journey and compliance tool configuration
- **feedback**: User feedback submission
- **processing**: Shared processing components (PersonAvatar, ProcessingGrid, MilestoneEditForm)
- **pwa**: Progressive Web App install prompt
- **user-menu**: User profile dropdown with sign-out

All components follow kebab-case naming and use named exports for consistency.

## Services

Application services provide business logic abstraction over the Ministry Platform API:

| Service | File | Purpose |
|---------|------|---------|
| **ContactService** | `contactService.ts` | Contact search and updates |
| **ContactLogService** | `contactLogService.ts` | Contact log CRUD with validation |
| **DashboardService** | `dashboardService.ts` | Executive dashboard metrics and trends |
| **JourneyProcessingService** | `journeyProcessingService.ts` | Journey workflow step processing |
| **ComplianceProcessingService** | `complianceProcessingService.ts` | Compliance workflow processing |
| **MemberService** | `memberService.ts` | Membership status management, milestones, transitions |
| **FeedbackService** | `feedbackService.ts` | User feedback submission |
| **UserService** | `userService.ts` | User profile and roles retrieval |

All services follow the singleton pattern and use `MPHelper` for API communication.

## Testing

The project uses **Vitest** with test coverage for critical functionality.

### Running Tests

```bash
# Run tests in watch mode
npm test

# Single test run
npm run test:run

# Generate coverage report
npm run test:coverage
```

### Test Coverage

| Area | File | Coverage |
|------|------|----------|
| Authentication | `auth.test.ts` | Better Auth callbacks, session handling |
| Route Protection | `proxy.test.ts` | Proxy-based route protection, cookie validation |
| Rate Limiting | `rate-limit.test.ts` | Sliding window rate limit tiers |
| Authorization | `authorization.test.ts` | RBAC feature access control |
| Processing Utils | `processing-utils.test.ts` | Shared processing utilities |
| User Service | `userService.test.ts` | User profile retrieval |
| MP Client | `client.test.ts` | OAuth token management |
| MPHelper | `helper.test.ts` | All CRUD operations, validation |
| Table Service | `table.service.test.ts` | Table operations |
| HTTP Client | `http-client.test.ts` | HTTP methods, URL building |

### Test Configuration

Tests are configured in `vitest.config.ts`:
- Environment variables stubbed in `src/test-setup.ts`
- Auto-generated models excluded from coverage
- Supports TypeScript path aliases

## Development

### Available Commands

```bash
# Start development server
npm run dev

# Build for production (includes type checking)
npm run build

# Start production server
npm start

# Run ESLint
npm run lint

# Run tests
npm test              # Watch mode
npm run test:run      # Single run
npm run test:coverage # With coverage report

# Generate MP types to models directory with Zod schemas (recommended)
npm run mp:generate:models
```

### Building for Production

```bash
npm run build
npm start
```

> **Note**: The build process includes TypeScript type checking. Ensure all generated types are up to date by running `npm run mp:generate:models` before building.

## Claude Code Commands

This project includes custom [Claude Code](https://claude.ai/code) commands (skills) to streamline development workflows. These commands are invoked using the `/command` syntax in Claude Code.

### Available Commands

| Command | Description |
|---------|-------------|
| `/audit-deps` | Security and update audit for dependencies |
| `/branch-commit [args]` | Create branch and commit changes, optionally linked to GitHub issue |
| `/pr [args]` | Create a pull request with validation |

### `/audit-deps` - Dependency Audit

Performs a comprehensive security and update analysis of project dependencies.

**What it does:**
- Runs `npm audit` for vulnerability detection
- Searches for recent CVEs affecting major dependencies
- Categorizes updates as safe (patch/minor) or major (breaking changes)
- Generates a prioritized action plan

**Usage:**
```
/audit-deps
```

### `/branch-commit` - Branch and Commit

Creates a new branch from the current branch, stages all changes, and commits with detailed notes. Can auto-generate branch name and commit message from a GitHub issue.

**Usage:**
```
/branch-commit                           # Prompts for branch name and commit message
/branch-commit #123                      # Auto-generates from GitHub issue #123
/branch-commit feature/my-change: Add new feature  # Manual branch and commit message
/branch-commit #123 fix/custom-name: Custom message  # Issue reference with custom names
```

**Branch naming convention:**
- `fix/issue-<id>-<slug>` - For bug fixes (issues with "bug" label)
- `feature/issue-<id>-<slug>` - For features/enhancements

### `/pr` - Pull Request

Creates a pull request after validating all prerequisites are met.

**Validations performed:**
- Not on main/master/dev branch
- No uncommitted changes
- Branch pushed to origin
- No existing open PR for branch

**Usage:**
```
/pr                    # Create PR to main branch
/pr --base dev         # Create PR to dev branch
/pr --draft            # Create as draft PR
/pr #123               # Link to specific GitHub issue
```

### Command Files

Command definitions are stored in `.claude/commands/`:
```
.claude/commands/
├── audit-deps.md      # Dependency audit command
├── branch-commit.md   # Branch and commit command
└── pr.md              # Pull request command
```

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Development guide with commands, architecture, and code style conventions
- **[DOCKER.md](DOCKER.md)** - Docker deployment guide (production and development)
- **[OAUTH_LOGOUT_SETUP.md](docs/OAUTH_LOGOUT_SETUP.md)** - OAuth logout configuration and OIDC RP-initiated logout details
- **[Ministry Platform Provider](src/lib/providers/ministry-platform/docs/README.md)** - Complete provider documentation
- **[Type Generator](src/lib/providers/ministry-platform/scripts/README.md)** - CLI tool documentation

## Code Style & Conventions

### Import Paths
Use the `@/*` path alias for all internal imports:
```typescript
import { MPHelper } from '@/lib/providers/ministry-platform';
import { Button } from '@/components/ui/button';
import { ContactSearch } from '@/lib/dto';
import { Header, Sidebar } from '@/components/layout';
```

### Component Style
- React Server Components by default
- Add `"use client"` only when needed for interactivity
- Keep UI components in `src/components/ui/`
- Follow shadcn/ui conventions
- Use named exports (no default exports)
- Organize feature components in folders with barrel exports

### Naming Conventions
- **PascalCase**: Component names, types, interfaces
- **camelCase**: Functions, variables
- **kebab-case**: All component files and folders
- **snake_case**: Ministry Platform API fields

### Component Organization
```
src/components/
├── shared-actions/       # Cross-feature server actions
├── ui/                   # shadcn/ui components
├── layout/               # Layout components (header, sidebar, etc.)
├── processing/           # Shared processing components
├── feature-name/         # Feature folder (kebab-case)
│   ├── feature-name.tsx  # Main component
│   ├── actions.ts        # Feature-specific server actions
│   └── index.ts          # Barrel exports
```

### TypeScript
- Strict mode enabled
- Export interfaces from models
- Use Zod v4 schemas for validation
- Leverage TypeScript generics for type safety

## License

Private

## Support

For Ministry Platform API documentation, refer to your instance's API documentation portal.
