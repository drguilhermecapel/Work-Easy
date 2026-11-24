// The part of the vitest API that the handler tests of test/functions use, for running those same
// files in Deno (`npm run test:deno`). deno.json of this folder maps the "vitest" import here, so a
// test file runs unchanged in Node (vitest) and in the Deno runtime that serves the functions.
//
// describe/it come from @std/testing/bdd and expect from @std/expect (the jest-compatible matchers of
// the Deno standard library). Only what the tests use is here: a file that needs more (vi.mock,
// app code from lib/ or services/) stays vitest-only and is left out of the Deno list.

import { expect as stdExpect } from '@std/expect';
import {
  afterAll, afterEach, beforeAll, beforeEach, describe as bddDescribe, it as bddIt,
} from '@std/testing/bdd';

export { afterAll, afterEach, beforeAll, beforeEach };

type TestFn = () => void | Promise<void>;
type Row<T> = T extends readonly unknown[] ? T : [T];

/** vitest's printf for `.each` titles: %s %d %i %j %o %%. */
function title(template: string, args: readonly unknown[]): string {
  let index = 0;
  return template.replace(/%[sdijo%]/g, token => {
    if (token === '%%') return '%';
    const value = args[index++];
    if (token === '%j' || token === '%o') return JSON.stringify(value);
    if (token === '%d' || token === '%i') return String(Number(value));
    return String(value);
  });
}

type EachTest<Args extends readonly unknown[]> = (name: string, fn: (...args: Args) => void | Promise<void>) => void;

// Same overloads as vitest: rows written as array literals are typed as tuples, and a row that is
// not an array is passed as the only argument
// deno-lint-ignore no-explicit-any
function each<T extends any[] | [any]>(cases: readonly T[]): EachTest<T>;
function each<T>(cases: readonly T[]): EachTest<Row<T>>;
function each<T>(cases: readonly T[]): EachTest<Row<T>> {
  return (name, fn) => {
    for (const row of cases) {
      const args = (Array.isArray(row) ? row : [row]) as Row<T>;
      bddIt(title(name, args), () => fn(...args));
    }
  };
}

export const describe = (name: string, fn: () => void): void => {
  bddDescribe(name, fn);
};

export const it = Object.assign((name: string, fn: TestFn): void => {
  bddIt(name, fn);
}, { each });

export const test = it;

/** expect of @std/expect, plus vitest's expect.unreachable. */
export const expect = Object.assign(
  (value: unknown, message?: string) => stdExpect(value, message),
  stdExpect,
  {
    unreachable(message = 'reached code that should be unreachable'): never {
      throw new Error(message);
    },
  },
);

// ---- vi.fn / vi.spyOn -------------------------------------------------------------------------------

// @std/expect reads the calls of a mock from this symbol (toHaveBeenCalled and the like)
const MOCK = Symbol.for('@MOCK');

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => any;

export interface Mock<F extends AnyFn> {
  (...args: Parameters<F>): ReturnType<F>;
  mock: { calls: Parameters<F>[] };
  mockRestore(): void;
}

function mockOf<F extends AnyFn>(impl: F | undefined, restore: () => void = () => {}): Mock<F> {
  const calls: Parameters<F>[] = [];
  const records: { args: unknown[]; returned?: unknown; thrown?: unknown; timestamp: number; returns: boolean; throws: boolean }[] = [];
  const mock = function (this: unknown, ...args: Parameters<F>) {
    calls.push(args);
    try {
      const returned = impl?.apply(this, args);
      records.push({ args, returned, timestamp: Date.now(), returns: true, throws: false });
      return returned;
    } catch (error) {
      records.push({ args, thrown: error, timestamp: Date.now(), returns: false, throws: true });
      throw error;
    }
  } as Mock<F>;
  Object.defineProperty(mock, MOCK, { value: { calls: records } });
  mock.mock = { calls };
  mock.mockRestore = restore;
  return mock;
}

export const vi = {
  fn<F extends AnyFn = AnyFn>(impl?: F): Mock<F> {
    return mockOf(impl);
  },
  spyOn<O extends object, K extends keyof O>(object: O, key: K): O[K] extends AnyFn ? Mock<O[K]> : never {
    const original = object[key] as AnyFn;
    const spy = mockOf(original, () => {
      object[key] = original as O[K];
    });
    object[key] = spy as O[K];
    return spy as O[K] extends AnyFn ? Mock<O[K]> : never;
  },
};
