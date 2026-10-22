// Minimal stand-in for the Supabase client used by services and AuthContext.
// Records every call so tests can assert what the app sent. Plain functions
// (not vi.fn) so vi.restoreAllMocks in test/setup.ts does not reset them.

export interface Result {
  data: unknown;
  error: unknown;
}

export interface TableCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  columns?: string;
  payload?: unknown;
  filters: Array<[op: string, column: string, value: unknown]>;
  single?: 'single' | 'maybe';
}

export type TableHandler = (call: TableCall) => Result;

interface FakeUser {
  id: string;
  email?: string;
  phone?: string;
}

interface FakeSession {
  access_token: string;
  user: FakeUser;
}

type AuthListener = (event: string, session: FakeSession | null) => void;

export interface FakeSupabase {
  /** Configure per test */
  session: FakeSession | null;
  tables: Record<string, TableHandler>;
  rpcs: Record<string, (args: Record<string, unknown> | undefined) => Result>;
  functionsHandlers: Record<string, (body: unknown) => Result>;
  /** Recorded calls */
  tableCalls: TableCall[];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }>;
  functionCalls: Array<{ name: string; body: unknown }>;
  authCalls: Array<{ method: string; args: unknown }>;
  reset: () => void;
  signIn: (user: FakeUser) => void;
  // Client surface
  from: (table: string) => unknown;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<Result>;
  functions: { invoke: (name: string, options?: { body?: unknown }) => Promise<Result> };
  auth: {
    getSession: () => Promise<{ data: { session: FakeSession | null }; error: null }>;
    onAuthStateChange: (cb: AuthListener) => { data: { subscription: { unsubscribe: () => void } } };
    signInWithOtp: (args: unknown) => Promise<{ data: object; error: unknown }>;
    verifyOtp: (args: unknown) => Promise<{ data: { user: FakeUser | null; session: FakeSession | null }; error: unknown }>;
    signOut: () => Promise<{ error: null }>;
  };
}

const ok = (data: unknown): Result => ({ data, error: null });

export const createFakeSupabase = (): FakeSupabase => {
  let listeners: AuthListener[] = [];

  const fake: FakeSupabase = {
    session: null,
    tables: {},
    rpcs: {},
    functionsHandlers: {},
    tableCalls: [],
    rpcCalls: [],
    functionCalls: [],
    authCalls: [],

    reset() {
      fake.session = null;
      fake.tables = {};
      fake.rpcs = {};
      fake.functionsHandlers = {};
      fake.tableCalls = [];
      fake.rpcCalls = [];
      fake.functionCalls = [];
      fake.authCalls = [];
      listeners = [];
    },

    signIn(user) {
      fake.session = { access_token: 'test-token', user };
      for (const listener of listeners) listener('SIGNED_IN', fake.session);
    },

    from(table: string) {
      const call: TableCall = { table, op: 'select', filters: [] };
      const builder = {
        select(columns?: string) {
          if (call.op === 'select') call.columns = columns;
          return builder;
        },
        insert(payload: unknown) {
          call.op = 'insert';
          call.payload = payload;
          return builder;
        },
        update(payload: unknown) {
          call.op = 'update';
          call.payload = payload;
          return builder;
        },
        delete() {
          call.op = 'delete';
          return builder;
        },
        eq(column: string, value: unknown) {
          call.filters.push(['eq', column, value]);
          return builder;
        },
        in(column: string, value: unknown) {
          call.filters.push(['in', column, value]);
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        single() {
          call.single = 'single';
          return builder;
        },
        maybeSingle() {
          call.single = 'maybe';
          return builder;
        },
        then<T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T) {
          return Promise.resolve()
            .then(() => {
              fake.tableCalls.push(call);
              const handler = fake.tables[table];
              return handler ? handler(call) : ok(call.single ? null : []);
            })
            .then(resolve, reject);
        },
      };
      return builder;
    },

    async rpc(name, args) {
      fake.rpcCalls.push({ name, args });
      return fake.rpcs[name]?.(args) ?? ok(null);
    },

    functions: {
      async invoke(name, options) {
        fake.functionCalls.push({ name, body: options?.body });
        return fake.functionsHandlers[name]?.(options?.body) ?? ok({ ok: true, data: null });
      },
    },

    auth: {
      async getSession() {
        return { data: { session: fake.session }, error: null };
      },
      onAuthStateChange(cb) {
        listeners.push(cb);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                listeners = listeners.filter(l => l !== cb);
              },
            },
          },
        };
      },
      async signInWithOtp(args) {
        fake.authCalls.push({ method: 'signInWithOtp', args });
        return { data: {}, error: null };
      },
      async verifyOtp(args) {
        fake.authCalls.push({ method: 'verifyOtp', args });
        const user = { id: 'user-otp', email: (args as { email?: string }).email };
        fake.signIn(user);
        return { data: { user, session: fake.session }, error: null };
      },
      async signOut() {
        fake.authCalls.push({ method: 'signOut', args: null });
        fake.session = null;
        for (const listener of listeners) listener('SIGNED_OUT', null);
        return { error: null };
      },
    },
  };

  return fake;
};

/** Profile row as the database returns it. */
export const profileRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  full_name: 'Maria Teste',
  phone: null,
  role: 'client',
  city: 'São Paulo',
  deleted_at: null,
  created_at: '2026-10-01T12:00:00Z',
  ...overrides,
});

export const isEq = (call: TableCall, column: string, value: unknown) =>
  call.filters.some(([op, c, v]) => op === 'eq' && c === column && v === value);
