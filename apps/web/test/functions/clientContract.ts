// Helper of the client contract tests (client-contracts.test.ts): answers the app's
// `supabase.functions.invoke(...)` with the REAL Edge Function handler, so the request the app
// builds is the one the handler validates, and the answer the handler builds is the one the app reads.
import type { FakeSupabase } from '../web/fakeSupabase';

const ENDPOINT = 'http://localhost:54321/functions/v1/';

/** What the handler of a function receives: the request supabase-js would have sent for that call. */
export const requestOf = (name: string, call: { body: unknown; method?: string; headers?: Record<string, string> }): Request => {
  const headers: Record<string, string> = { Authorization: 'Bearer user-jwt', ...call.headers };
  // supabase-js sends an object as JSON and leaves a FormData to fetch (which writes the multipart boundary)
  const isForm = typeof FormData !== 'undefined' && call.body instanceof FormData;
  if (!isForm) headers['Content-Type'] ??= 'application/json';
  return new Request(`${ENDPOINT}${name}`, {
    method: call.method ?? 'POST',
    headers,
    body: isForm ? (call.body as FormData) : JSON.stringify(call.body),
  });
};

/**
 * Makes `functions.invoke(name)` run `run` (the real handler with test deps) and hand its answer to the
 * app the way supabase-js does: a 2xx answer is the parsed JSON, any other status is a FunctionsHttpError
 * that carries the HTTP response in `context`.
 */
export const serveFunction = (fake: FakeSupabase, name: string, run: (request: Request) => Promise<Response>): void => {
  fake.functionsHandlers[name] = async body => {
    // The fake records the call before it answers: this is the call being answered
    const options = fake.functionOptions[fake.functionOptions.length - 1];
    const response = await run(requestOf(name, { body, method: options?.method, headers: options?.headers }));
    if (!response.ok) {
      return {
        data: null,
        error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: response },
      };
    }
    return { data: await response.json(), error: null };
  };
};
