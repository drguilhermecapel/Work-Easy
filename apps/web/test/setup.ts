import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// findBy*/waitFor wait 1 s by default, which is too short on a busy CI runner
// or while other jobs use the CPU; a longer wait only slows down real failures.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
