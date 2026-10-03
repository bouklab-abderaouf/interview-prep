// A stand-in for the Supabase client in route-handler tests. Every query is
// recorded as an `Op` (table, action, filters, payload) and answered by a
// `respond` callback, so a test can both script the database and assert
// exactly what a handler asked it to do — e.g. that a delete was scoped to
// the signed-in user. It does not model RLS; policies are SQL and live in
// supabase/migrations/.

export interface Op {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert" | "rpc" | "storage";
  filters: Array<[op: string, column: string, value: unknown]>;
  columns?: string;
  returning?: string;
  payload?: unknown;
  single?: "single" | "maybeSingle";
}

export interface Result {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

export function fakeSupabase({
  userId = "user-1",
  respond = () => ({}),
}: {
  userId?: string | null;
  respond?: (op: Op) => Result | undefined;
} = {}) {
  const ops: Op[] = [];

  const builder = (table: string) => {
    const op: Op = { table, action: "select", filters: [] };
    const chain = {
      select(columns?: string) {
        if (op.action === "select") op.columns = columns;
        else op.returning = columns ?? "*";
        return chain;
      },
      insert(payload: unknown) {
        op.action = "insert";
        op.payload = payload;
        return chain;
      },
      update(payload: unknown) {
        op.action = "update";
        op.payload = payload;
        return chain;
      },
      upsert(payload: unknown) {
        op.action = "upsert";
        op.payload = payload;
        return chain;
      },
      delete() {
        op.action = "delete";
        return chain;
      },
      eq: (column: string, value: unknown) => filter("eq", column, value),
      neq: (column: string, value: unknown) => filter("neq", column, value),
      in: (column: string, value: unknown) => filter("in", column, value),
      order: () => chain,
      limit: () => chain,
      returns: () => chain,
      maybeSingle() {
        op.single = "maybeSingle";
        return chain;
      },
      single() {
        op.single = "single";
        return chain;
      },
      then<T>(resolve: (value: Required<Result>) => T, reject?: (reason: unknown) => T) {
        ops.push(op);
        const result = respond(op) ?? {};
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
          count: result.count ?? null,
        }).then(resolve, reject);
      },
    };
    const filter = (kind: string, column: string, value: unknown) => {
      op.filters.push([kind, column, value]);
      return chain;
    };
    return chain;
  };

  // rpc("fn", args) is recorded as { table: "rpc:fn", action: "rpc", payload: args }.
  const rpc = (fn: string, args: Record<string, unknown> = {}) => {
    const op: Op = { table: `rpc:${fn}`, action: "rpc", filters: [], payload: args };
    ops.push(op);
    const result = respond(op) ?? {};
    return Promise.resolve({
      data: result.data ?? null,
      error: result.error ?? null,
      count: result.count ?? null,
    });
  };

  // storage.from(bucket).upload/remove/list/createSignedUrl is recorded as
  // { table: "storage:<bucket>", action: "storage", columns: <method>, payload }.
  const storage = {
    from: (bucket: string) => {
      const call = (method: string) => async (...args: unknown[]) => {
        const op: Op = { table: `storage:${bucket}`, action: "storage", columns: method, filters: [], payload: args };
        ops.push(op);
        const result = respond(op) ?? {};
        return { data: result.data ?? null, error: result.error ?? null };
      };
      return {
        upload: call("upload"),
        remove: call("remove"),
        list: call("list"),
        createSignedUrl: call("createSignedUrl"),
      };
    },
  };

  const client = {
    rpc,
    storage,
    auth: {
      getClaims: async () => ({
        data: userId ? { claims: { sub: userId, email: `${userId}@example.com` } } : null,
        error: null,
      }),
    },
    from: builder,
  };

  return { client, ops };
}

/** The `ctx` Next passes to a dynamic route handler. */
export function routeContext<P extends Record<string, string>>(params: P) {
  return { params: Promise.resolve(params) };
}

export function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
