# Component Reference Guide

This document provides detailed context about the `src/components/` folder structure for LLM assistants working on the MPNext project.

## Folder Overview

```
src/components/
├── shared-actions/             # Shared server actions
├── ui/                         # shadcn/ui components (20 components)
├── processing/                 # Shared processing UI components (9 components)
├── admin/                      # Admin settings (journey tools, compliance tools, permissions, feedback)
├── compliance-processing/      # Compliance applicant workflow (background checks, certifications)
├── contact-logs/               # Contact log CRUD feature
├── contact-lookup/             # Contact search feature
├── contact-lookup-details/     # Contact details view
├── dashboard/                  # Executive dashboard feature
├── feedback/                   # In-app feedback button and wrapper
├── home/                       # Home page feature cards
├── journey-processing/         # Journey applicant milestone workflow
├── manage-members/             # Member management with status transitions
├── pwa/                        # Progressive Web App install prompt
├── user-menu/                  # User dropdown menu
└── layout/                     # Layout components with barrel export
    ├── index.ts                # Barrel export for all layout components
    ├── auth-wrapper.tsx        # Authentication wrapper (Server Component)
    ├── header.tsx              # App header with navigation
    ├── sidebar.tsx             # Navigation sidebar
    └── dynamic-breadcrumb.tsx  # Breadcrumb navigation
```

## Component Categories

### Layout Components (`layout/` folder)

| File | Type | Purpose |
|------|------|---------|
| `layout/index.ts` | Barrel | Re-exports all layout components |
| `layout/auth-wrapper.tsx` | Server | Wraps app to enforce authentication, redirects unauthenticated users |
| `layout/header.tsx` | Client | Top navigation bar with hamburger menu and user menu |
| `layout/sidebar.tsx` | Client | Slide-out navigation menu with page links |
| `layout/dynamic-breadcrumb.tsx` | Client | Auto-generates breadcrumbs from URL or custom segments |

### Feature Components

| Folder | Purpose | Has Actions |
|--------|---------|-------------|
| `admin/` | Admin settings page with sub-pages for journey tools, compliance tools, permissions, feedback | Yes |
| `compliance-processing/` | Compliance applicant tracking with background checks, certifications, group assignment | Yes |
| `contact-logs/` | Contact log CRUD with modal forms | Yes |
| `contact-lookup/` | Contact search with results display | Yes |
| `contact-lookup-details/` | Contact profile and logs view | Yes |
| `dashboard/` | Executive dashboard with charts and filters | Yes |
| `feedback/` | In-app feedback button with modal form | Yes |
| `home/` | Home page feature cards (RBAC-filtered) | No |
| `journey-processing/` | Journey applicant milestone tracking with pause/resume | Yes |
| `manage-members/` | Member management with tabs, status transitions, detail modals | Yes |
| `pwa/` | PWA install prompt banner | No |
| `user-menu/` | User dropdown with sign-out | Yes |

### Shared Processing Components (`processing/` folder)

Domain-specific shared components used by journey and compliance processing features. These are NOT general-purpose UI primitives (those go in `ui/`).

```
processing/
├── index.ts                      # Barrel export
├── person-avatar.tsx             # Photo circle with initials fallback
├── detail-modal-photo-upload.tsx # Clickable photo with upload overlay
├── contact-links.tsx             # Email/phone bordered pill-style buttons
├── processing-grid.tsx           # Card grid with loading/error/empty states
├── processing-search-bar.tsx     # Search bar for filtering processing grids
├── file-type-icon.tsx            # PDF/image/generic file icon
├── milestone-expanded-view.tsx   # Read-only milestone detail (notes + file list)
├── milestone-edit-form.tsx       # Edit mode: date, notes, file input, save/cancel
└── quick-actions-panel.tsx       # Milestone dropdown + date/notes/file/submit
```

| Component | Purpose | Used By |
|---|---|---|
| `PersonAvatar` | Photo circle (MP file URL) with initials fallback | Processing cards and detail modals |
| `DetailModalPhotoUpload` | Clickable avatar with upload overlay + file validation | Processing detail modals |
| `ContactLinks` | Bordered pill-style email/phone links | Processing detail modals |
| `ProcessingGrid` | Card grid with skeleton loading, error, and empty states | Processing main page components |
| `ProcessingSearchBar` | Search bar for filtering processing grids | Processing main page components |
| `FileTypeIcon` | PDF/image/generic file icon | Milestone expanded view, milestone edit form |
| `MilestoneExpandedView` | Read-only milestone detail: notes + downloadable file list | Processing detail modals |
| `MilestoneEditForm` | Edit mode: date picker, notes textarea, file input, save/cancel | Processing detail modals |
| `QuickActionsPanel` | Milestone dropdown + date/notes/file/submit for quick creation | Processing detail modals |

**Import**: `import { PersonAvatar, ProcessingGrid, MilestoneEditForm } from '@/components/processing';`

**Supporting utilities**:
- `src/lib/processing-utils.ts` — `getDisplayName()`, `getInitials()`, `getImageUrl()`, `formatDate()`, file type/size constants
- `src/lib/dto/processing-shared.ts` — `BasePersonInfo`, `BaseCardData<T,C>`, `BaseFileInfo`, `BaseMilestoneDetail` base interfaces
- `src/components/shared-actions/processing.ts` — `extractValidatedFiles()`, `extractValidatedFilesResult()`, `uploadContactPhoto()` server action helpers

### Processing Features — Shared Architecture

Journey and compliance processing features follow the same pattern:

```
feature-processing/
├── index.ts                      # Barrel export
├── actions.ts                    # Server actions calling service singleton
├── feature-processing.tsx        # "use client" wrapper with tabs/grid + modal state
├── feature-card.tsx              # "use client" card for grid display
└── feature-detail-modal.tsx      # "use client" detail modal with milestones, quick actions
```

**Data flow**: Component → Server Action → Service (singleton) → MPHelper → Ministry Platform API

**Common capabilities**: Contact photo upload (1MB limit), file attachments on milestones, deep link support (`?applicant=ID`), milestone progress checklist, "View in MP" links, bordered pill-style email/phone buttons.

### UI Components (shadcn/ui)

20 components following shadcn conventions:
- `alert.tsx`, `alert-dialog.tsx`, `avatar.tsx`, `breadcrumb.tsx`
- `button.tsx`, `card.tsx`, `checkbox.tsx`, `dialog.tsx`
- `drawer.tsx`, `dropdown-menu.tsx`, `form.tsx`, `input.tsx`
- `label.tsx`, `radio-group.tsx`, `select.tsx`, `skeleton.tsx`
- `switch.tsx`, `tabs.tsx`, `textarea.tsx`, `tooltip.tsx`

## Server Actions Location

Actions are co-located with their feature components:

| Feature | Actions File | Key Functions |
|---------|--------------|-----------|
| admin | `admin/actions.ts` | Admin settings operations |
| compliance-processing | `compliance-processing/actions.ts` | Compliance applicant CRUD, milestone operations |
| contact-logs | `contact-logs/actions.ts` | `getContactLogTypes`, `createContactLog`, `updateContactLog`, `deleteContactLog` |
| contact-lookup | `contact-lookup/actions.ts` | `searchContacts` |
| contact-lookup-details | `contact-lookup-details/actions.ts` | `getContactDetails`, `getContactLogsByContactId` |
| dashboard | `dashboard/actions.ts` | `getDashboardMetrics`, `getFullRangeDashboardMetrics`, `refreshDashboardCache` |
| feedback | `feedback/actions.ts` | Feedback submission |
| journey-processing | `journey-processing/actions.ts` | Journey applicant CRUD, milestone operations, pause/resume |
| manage-members | `manage-members/actions.ts` | Member listing, status transitions, detail operations |
| user-menu | `user-menu/actions.ts` | `handleSignOut` |
| **shared** | `shared-actions/user.ts` | `getCurrentUserProfile` |
| **shared** | `shared-actions/processing.ts` | `extractValidatedFiles`, `extractValidatedFilesResult`, `uploadContactPhoto` |

**Shared Actions Folder**: `src/components/shared-actions/` contains actions used across multiple features.

## Import Patterns

```typescript
// Feature components (use barrel exports)
import { ContactLookup } from '@/components/contact-lookup';
import { ContactLogs } from '@/components/contact-logs';
import { JourneyProcessing } from '@/components/journey-processing';
import { ComplianceProcessing } from '@/components/compliance-processing';
import { ManageMembersShell } from '@/components/manage-members';
import { UserMenu } from '@/components/user-menu';

// UI components (individual imports)
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

// Layout components (barrel export)
import { AuthWrapper, Header, Sidebar, DynamicBreadcrumb } from '@/components/layout';

// Co-located actions (relative import within feature)
import { searchContacts } from './actions';

// Shared processing components (barrel export)
import { PersonAvatar, ProcessingGrid, MilestoneEditForm } from '@/components/processing';

// Shared processing utilities
import { getDisplayName, formatDate, MAX_FILE_SIZE } from '@/lib/processing-utils';

// Shared actions
import { getCurrentUserProfile } from '@/components/shared-actions/user';
import { extractValidatedFiles, uploadContactPhoto } from '@/components/shared-actions/processing';
```

## Component Structure Template

Each feature folder should follow this structure:

```
feature-name/
├── index.ts              # Barrel export: export { FeatureName } from './feature-name';
├── feature-name.tsx      # Main component file
├── actions.ts            # Server actions (if needed)
└── [sub-components].tsx  # Additional components (optional)
```

## Services Used

Components interact with these service classes:

| Service | Location | Used By |
|---------|----------|---------|
| ComplianceProcessingService | `@/services/complianceProcessingService` | compliance-processing |
| ContactService | `@/services/contactService` | contact-lookup, contact-lookup-details |
| ContactLogService | `@/services/contactLogService` | contact-logs |
| DashboardService | `@/services/dashboardService` | dashboard |
| FeedbackService | `@/services/feedbackService` | feedback |
| JourneyProcessingService | `@/services/journeyProcessingService` | journey-processing |
| MemberService | `@/services/memberService` | manage-members |
| UserService | `@/services/userService` | user-menu |

All services are singletons using `getInstance()` and ultimately use `MPHelper` from `@/lib/providers/ministry-platform` for API calls.
