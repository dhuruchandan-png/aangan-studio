// Neon (plain Postgres) data layer.
//
// The rest of the app was written against a small query-builder API (from().select().eq()...). This file keeps that API
// but runs it as parameterised SQL through `pg` against DATABASE_URL, so no other file had to change.
// Supported surface = exactly what the app uses: select (+count/head), insert, update, upsert, eq/neq/in/is/not/gt/gte/lt/lte/ilike,
// order, limit, single, maybeSingle, rpc. Errors are returned as { error }, never thrown (same contract as before).
import { Pool, types } from 'pg';
import { requireEnv } from './env';

// ---- value parsing: give the app the same JS shapes it always saw
types.setTypeParser(20, (v) => parseInt(v, 10));                 // bigint (count)  -> number
types.setTypeParser(1700, (v) => parseFloat(v));                 // numeric         -> number
types.setTypeParser(1082, (v) => v);                             // date            -> 'YYYY-MM-DD'
types.setTypeParser(1184, (v) => new Date(v).toISOString());     // timestamptz     -> ISO string
types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z').toISOString());

/** Neon gives `channel_binding=require`; the node driver does not need it, and we want strict TLS. */
export const cleanDbUrl = (raw: string): string => {
  const u = new URL(raw);
  u.searchParams.delete('channel_binding');
  u.searchParams.set('sslmode', 'verify-full');
  return u.toString();
};

const g = globalThis as unknown as { __aanganPool?: Pool; __aanganMeta?: Promise<Map<string, Map<string, string>>> };
const pool = (): Pool =>
  (g.__aanganPool ??= new Pool({ connectionString: cleanDbUrl(requireEnv('DATABASE_URL')), max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 15_000 }));

/** table -> column -> pg type name, so JSON columns get JSON and array columns get arrays. */
const loadMeta = (): Promise<Map<string, Map<string, string>>> =>
  (g.__aanganMeta ??= pool()
    .query("select table_name, column_name, udt_name from information_schema.columns where table_schema = 'public'")
    .then((r) => {
      const m = new Map<string, Map<string, string>>();
      for (const x of r.rows as { table_name: string; column_name: string; udt_name: string }[]) {
        if (!m.has(x.table_name)) m.set(x.table_name, new Map());
        m.get(x.table_name)!.set(x.column_name, x.udt_name);
      }
      return m;
    })
    .catch((e) => { g.__aanganMeta = undefined; throw e; }));

export interface DbError { message: string; code?: string }
export interface Res { data: any; error: DbError | null; count?: number | null } // eslint-disable-line @typescript-eslint/no-explicit-any

const IDENT = /^[a-z_][a-z0-9_]*$/i;
const ident = (s: string): string => { if (!IDENT.test(s)) throw new Error(`Unsafe identifier: ${s}`); return `"${s}"`; };
const PK: Record<string, string> = { app_settings: 'key', crm_links: 'enquiry_id' };

type Op = 'select' | 'insert' | 'update' | 'upsert';
type Filter = { col: string; op: 'eq' | 'neq' | 'in' | 'is' | 'not_is' | 'gt' | 'gte' | 'lt' | 'lte' | 'ilike'; val: unknown };

class Q implements PromiseLike<Res> {
  private op: Op = 'select';
  private cols = '*';
  private returning: string | null = null;
  private head = false;
  private wantCount = false;
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private conflict: string | undefined;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private max: number | null = null;
  private one: 'single' | 'maybe' | null = null;

  constructor(private table: string) { ident(table); }

  select(cols = '*', opts?: { count?: 'exact'; head?: boolean }): this {
    if (this.op === 'select') this.cols = cols; else this.returning = cols;
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(rows: Record<string, unknown> | Record<string, unknown>[]): this { this.op = 'insert'; this.payload = rows; return this; }
  update(patch: Record<string, unknown>): this { this.op = 'update'; this.payload = patch; return this; }
  upsert(rows: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }): this { this.op = 'upsert'; this.payload = rows; this.conflict = opts?.onConflict; return this; }

  eq(col: string, val: unknown): this { this.filters.push({ col, op: 'eq', val }); return this; }
  neq(col: string, val: unknown): this { this.filters.push({ col, op: 'neq', val }); return this; }
  in(col: string, val: unknown[]): this { this.filters.push({ col, op: 'in', val }); return this; }
  is(col: string, val: null | boolean): this { this.filters.push({ col, op: 'is', val }); return this; }
  not(col: string, op: string, val: unknown): this {
    if (op === 'is' && val === null) this.filters.push({ col, op: 'not_is', val: null });
    else if (op === 'eq') this.filters.push({ col, op: 'neq', val });
    else throw new Error(`.not('${col}', '${op}') is not supported`);
    return this;
  }
  gt(col: string, val: unknown): this { this.filters.push({ col, op: 'gt', val }); return this; }
  gte(col: string, val: unknown): this { this.filters.push({ col, op: 'gte', val }); return this; }
  lt(col: string, val: unknown): this { this.filters.push({ col, op: 'lt', val }); return this; }
  lte(col: string, val: unknown): this { this.filters.push({ col, op: 'lte', val }); return this; }
  ilike(col: string, val: string): this { this.filters.push({ col, op: 'ilike', val }); return this; }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this { this.orders.push({ col, asc: opts?.ascending ?? true, nullsFirst: opts?.nullsFirst }); return this; }
  limit(n: number): this { this.max = n; return this; }
  single(): this { this.one = 'single'; return this; }
  maybeSingle(): this { this.one = 'maybe'; return this; }

  then<A = Res, B = never>(f?: ((v: Res) => A | PromiseLike<A>) | null, r?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return this.exec().then(f, r);
  }

  private async exec(): Promise<Res> {
    try { return await this.run(); }
    catch (e) { const err = e as { message?: string; code?: string }; return { data: null, error: { message: err.message ?? String(e), code: err.code }, count: null }; }
  }

  private async run(): Promise<Res> {
    const meta = (await loadMeta()).get(this.table) ?? new Map<string, string>();
    const params: unknown[] = [];
    const P = (v: unknown): string => { params.push(v); return `$${params.length}`; };
    const conv = (col: string, v: unknown): unknown => {
      if (v === undefined) return null;
      if (v instanceof Date) return v.toISOString();
      const t = meta.get(col);
      if ((t === 'jsonb' || t === 'json') && v !== null) return JSON.stringify(v);
      return v;
    };
    const where = (): string => {
      const parts = this.filters.map((f) => {
        const c = ident(f.col);
        switch (f.op) {
          case 'eq': return f.val === null ? `${c} is null` : `${c} = ${P(conv(f.col, f.val))}`;
          case 'neq': return f.val === null ? `${c} is not null` : `${c} <> ${P(conv(f.col, f.val))}`;
          case 'in': return `${c} = any(${P(f.val)}::${ident(meta.get(f.col) ?? 'text')}[])`;
          case 'is': return f.val === null ? `${c} is null` : `${c} is ${f.val ? 'true' : 'false'}`;
          case 'not_is': return `${c} is not null`;
          case 'gt': return `${c} > ${P(f.val)}`;
          case 'gte': return `${c} >= ${P(f.val)}`;
          case 'lt': return `${c} < ${P(f.val)}`;
          case 'lte': return `${c} <= ${P(f.val)}`;
          case 'ilike': return `${c} ilike ${P(f.val)}`;
        }
      });
      return parts.length ? ` where ${parts.join(' and ')}` : '';
    };
    const colList = (s: string): string => (s.trim() === '*' ? '*' : s.split(',').map((x) => ident(x.trim())).join(', '));
    const t = ident(this.table);
    let sql: string;
    let count: number | null = null;

    if (this.op === 'select') {
      if (this.wantCount && this.head) {
        const r = await pool().query(`select count(*) as c from ${t}${where()}`, params as unknown[]);
        return { data: null, error: null, count: Number(r.rows[0].c) };
      }
      sql = `select ${colList(this.cols)} from ${t}${where()}`;
      if (this.orders.length) sql += ' order by ' + this.orders.map((o) => `${ident(o.col)} ${o.asc ? 'asc' : 'desc'}${o.nullsFirst === undefined ? '' : o.nullsFirst ? ' nulls first' : ' nulls last'}`).join(', ');
      if (this.max !== null) sql += ` limit ${Math.max(0, Math.floor(this.max))}`;
    } else if (this.op === 'update') {
      const patch = this.payload as Record<string, unknown>;
      const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
      if (!keys.length) return { data: null, error: null };
      const sets = keys.map((k) => `${ident(k)} = ${P(conv(k, patch[k]))}`).join(', ');
      sql = `update ${t} set ${sets}${where()}`;
    } else {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload!]) as Record<string, unknown>[];
      if (!rows.length) return { data: [], error: null };
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r).filter((k) => r[k] !== undefined)))];
      const values = rows.map((r) => `(${keys.map((k) => (r[k] === undefined ? 'default' : P(conv(k, r[k])))).join(', ')})`).join(', ');
      sql = `insert into ${t} (${keys.map(ident).join(', ')}) values ${values}`;
      if (this.op === 'upsert') {
        const target = this.conflict ?? PK[this.table] ?? 'id';
        const upd = keys.filter((k) => !target.split(',').map((x) => x.trim()).includes(k));
        sql += ` on conflict (${target.split(',').map((x) => ident(x.trim())).join(', ')}) ` + (upd.length ? `do update set ${upd.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}` : 'do nothing');
      }
    }
    if (this.op !== 'select' && this.returning) sql += ` returning ${colList(this.returning)}`;

    const r = await pool().query(sql, params as unknown[]);
    const returnsRows = this.op === 'select' || !!this.returning;
    let data: unknown = returnsRows ? r.rows : null;
    if (this.wantCount && this.op === 'select') count = r.rowCount;
    if (this.one && Array.isArray(data)) {
      if (data.length === 1) data = data[0];
      else if (data.length === 0 && this.one === 'maybe') data = null;
      else return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    }
    return { data, error: null, count };
  }
}

export interface Db {
  from(table: string): Q;
  rpc(fn: string, args?: Record<string, unknown>): Promise<Res>;
}

const database: Db = {
  from: (table) => new Q(table),
  async rpc(fn, args = {}) {
    try {
      const names = Object.keys(args);
      const call = `${ident(fn)}(${names.map((n, i) => `${ident(n)} => $${i + 1}`).join(', ')})`;
      const r = await pool().query(`select ${call} as v`, names.map((n) => args[n]));
      return { data: r.rows[0]?.v ?? null, error: null };
    } catch (e) { const err = e as { message?: string; code?: string }; return { data: null, error: { message: err.message ?? String(e), code: err.code } }; }
  },
};

/** Server-side database handle. */
export const db = (): Db => database;

/** Raw access for scripts and tests (parameterised SQL). */
export const rawQuery = (text: string, params: unknown[] = []) => pool().query(text, params);

// Rows are loosely typed (no generated Database types), so the unwrapped value is `any` by design.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function must(res: { data: unknown; error: { message: string } | null }, what: string): any {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export async function getSetting<T>(key: string, dflt: T): Promise<T> {
  const { data } = await db().from('app_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as T) ?? dflt;
}
export async function setSetting(key: string, value: unknown): Promise<void> {
  must(await db().from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() }), `setSetting ${key}`);
}
