# Testing

## When to Write Tests

**When adding or modifying testable code, include tests in the same commit.** Testable code includes:
- Service classes and their methods (`src/services/`)
- Utility functions (`src/lib/`, `src/lib/providers/ministry-platform/utils/`)
- Server actions (`actions.ts`)
- Auth helpers, rate limiting, authorization logic
- Config type validation and pure helpers
- Any function with branching logic, error handling, or data transformation

**What does NOT need unit tests:**
- React components (UI rendering) — these need integration/E2E tests instead
- `'use cache'` functions — framework-managed, not unit-testable
- Type-only files, barrel `index.ts` exports
- Better Auth / Next.js configuration objects
- shadcn/ui components (`src/components/ui/`)
- Thin facades that only delegate to already-tested code (e.g., `provider.ts`)
- Filesystem I/O wrappers where the pure logic is tested separately (e.g., `*-config.ts` I/O vs `*-config-types.ts` logic)

## Test File Conventions

- Co-locate test files next to their source: `foo.ts` → `foo.test.ts`
- Use Vitest: `import { describe, it, expect, vi } from 'vitest'`
- Use `@/` path alias for imports in test files
- Name test files with `.test.ts` or `.test.tsx` suffix

## Vitest 5 Behaviour

- **Mock call history is cleared before every test** (`clearMocks` defaults to `true` since Vitest 5). Implementations set with `mockResolvedValue`/`mockImplementation` survive; recorded calls do not. Never assert on calls made in a setup file, at module top level or in `beforeAll`. Existing `beforeEach(() => vi.clearAllMocks())` lines are now redundant but harmless.
- **`vi.mock`/`vi.hoisted` must be at the top level of the file** — Vitest 5 throws on a nested call. `vi.doMock` may go anywhere.
- **Await every `.resolves`/`.rejects` assertion** — an unawaited one fails the test.
- **jest-dom matchers** (`toBeInTheDocument`, …) come from `src/test-setup.ts` importing **`@testing-library/jest-dom/vitest`** (same as event-manager and mp-senior-care). Do not change it back to the bare `@testing-library/jest-dom`: that entry types the matchers only through the global `jest.Matchers`, which Vitest 5's `Assertion` no longer extends, so `tsc --noEmit` fails with `Property 'toBeInTheDocument' does not exist on type 'Assertion<void, HTMLElement>'` while the tests still pass.
- **Coverage `exclude` patterns are matched relative to the root**: write directories as `dir/**`. A bare `dir/` silently stopped excluding the generated models on the upgrade.

## Mocking Patterns

### Service singletons
```typescript
vi.mock('@/lib/providers/ministry-platform', () => ({
  MPHelper: class {
    getTableRecords = mockGetTableRecords;
    updateTableRecords = mockUpdateTableRecords;
  },
}));
```

### Parallel queries (Promise.all)
When the code under test fires parallel queries, `mockResolvedValueOnce` ordering is non-deterministic. Use `mockImplementation` that dispatches based on arguments:
```typescript
mockGetTableRecords.mockImplementation((params: { table: string }) => {
  if (params.table === 'Contacts') return Promise.resolve(mockContacts);
  if (params.table === 'Groups') return Promise.resolve(mockGroups);
  return Promise.resolve([]);
});
```

### Next.js server APIs
```typescript
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
```

### Filesystem (for config tests)
```typescript
vi.mock(import("fs"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn() };
});
```

### Environment variables
```typescript
const originalEnv = process.env;
beforeEach(() => { process.env = { ...originalEnv }; });
afterEach(() => { process.env = originalEnv; });
```

### Global fetch
```typescript
vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(data) }));
// In afterEach:
vi.unstubAllGlobals();
```

## Coverage Expectations

- New services and utilities: aim for **100% statement coverage**
- Server actions: aim for **90%+** (error paths may be hard to reach)
- Overall project floor: **65%+** (dashboard/UI components bring this down)
- Run `npm run test:coverage` to check before committing

## Running Tests

```bash
npm test                    # Watch mode
npm run test:run            # Single run
npm run test:coverage       # With coverage report
npx vitest run path/to/file.test.ts  # Single file
```
