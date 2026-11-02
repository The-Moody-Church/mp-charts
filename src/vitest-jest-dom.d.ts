// jest-dom matcher types for Vitest 5. Delete when @testing-library/jest-dom
// ships the fix (testing-library/jest-dom#738, PR #742).
//
// Vitest 5's Assertion takes two type parameters (<R, T>), so jest-dom's own
// `Assertion<T>` augmentation (types/vitest.d.ts, unchanged in 7.0.1) no longer
// merges and matchers such as toBeInTheDocument vanish from the types. The
// runtime is unaffected: src/test-setup.ts still registers them with
// expect.extend. This augments Matchers<R, T>, the interface Vitest 5 documents
// for custom matchers (it feeds Assertion and expect.extend).
import 'vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<unknown, R> {}
}
