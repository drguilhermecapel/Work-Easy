// Checks of the vitest stand-in (vitest.ts) itself, written with Deno.test and node:assert so they
// do not depend on it: a stand-in that let a wrong assertion pass would make the Deno run worthless.

import assert from 'node:assert/strict';
import { expect, vi } from './vitest.ts';

Deno.test('expect fails on a mismatch, and .not inverts', () => {
  assert.throws(() => expect(1).toBe(2));
  assert.throws(() => expect({ a: 1 }).toEqual({ a: 2 }));
  assert.throws(() => expect({ a: 1, b: 2 }).toMatchObject({ a: 1, c: 3 }));
  assert.throws(() => expect([1, 2]).not.toContain(2));
  expect({ a: 1, b: 2 }).toMatchObject({ a: 1 });
  expect([1, 2]).toHaveLength(2);
});

Deno.test('toEqual ignores undefined properties, as in vitest; toStrictEqual does not', () => {
  expect({ a: 1, b: undefined }).toEqual({ a: 1 });
  assert.throws(() => expect({ a: 1, b: undefined }).toStrictEqual({ a: 1 }));
});

Deno.test('rejects and resolves fail when the promise does the opposite', async () => {
  await assert.rejects(() => expect(Promise.resolve(1)).rejects.toThrow());
  await assert.rejects(() => expect(Promise.reject(new Error('x'))).resolves.toBe(1));
  await expect(Promise.reject(Object.assign(new Error('x'), { code: 'c' }))).rejects.toMatchObject({ code: 'c' });
});

Deno.test('expect.unreachable throws', () => {
  assert.throws(() => expect.unreachable('here'), /here/);
});

Deno.test('vi.fn records calls and works with toHaveBeenCalled', () => {
  const double = vi.fn((a: number) => a + 1);
  expect(double).not.toHaveBeenCalled();
  assert.equal(double(1), 2);
  expect(double).toHaveBeenCalled();
  expect(double).toHaveBeenCalledWith(1);
  assert.throws(() => expect(double).not.toHaveBeenCalled());
  assert.deepEqual(double.mock.calls, [[1]]);
});

Deno.test('vi.spyOn calls through and mockRestore puts the original back', () => {
  const target = { twice: (n: number) => n * 2 };
  const original = target.twice;
  const spy = vi.spyOn(target, 'twice');
  assert.equal(target.twice(3), 6);
  assert.deepEqual(spy.mock.calls, [[3]]);
  spy.mockRestore();
  assert.equal(target.twice, original);
});
