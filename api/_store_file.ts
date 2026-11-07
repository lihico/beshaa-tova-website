/**
 * FileStore (docs/attribution/00_DESIGN.md section 5.2): the test-mode store. Append-only JSONL in
 * ATTR_DATA_DIR (default website/.test-data): touches.jsonl, orders.jsonl ({op, order_id, data, at};
 * getOrder replays), payments.jsonl; registries codes.json, partners.json. Also sheet_rows.jsonl:
 * the header-keyed attribution object SheetStore would send, with any key the live header list
 * (tests/e2e/fixtures/sheet_headers.json) lacks listed in `unknown_keys`, so tests prove nothing
 * would be dropped. No caches: every read goes to disk, so POST /__test/reset needs no hook.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toSheetColumns, type OrderRecord, type PaymentRecord, type Partner, type TrackingCode } from "./_attribution_core.js";
import type { Store, StoredTouch } from "./_store.js";

/** Resolved lazily (not at module load), so production functions that import this module never touch import.meta. */
function headersFixture(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "tests", "e2e", "fixtures", "sheet_headers.json");
}

/** One process-wide chain: every write (and read-modify-write) runs after the previous one. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

interface OrderLine { op: "insert" | "update"; order_id: string; data: Partial<OrderRecord>; at: string }

export class FileStore implements Store {
  readonly mode = "file" as const;
  readonly dir: string;
  private headers: Set<string> | null = null;

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  private file(name: string): string {
    return path.join(this.dir, name);
  }

  private append(name: string, obj: unknown): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.appendFileSync(this.file(name), JSON.stringify(obj) + "\n");
  }

  private readLines<T>(name: string): T[] {
    const f = this.file(name);
    if (!fs.existsSync(f)) return [];
    const out: T[] = [];
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line) as T); } catch { /* a torn line is skipped */ }
    }
    return out;
  }

  private readJson<T>(name: string, fallback: T): T {
    try { return JSON.parse(fs.readFileSync(this.file(name), "utf8")) as T; } catch { return fallback; }
  }

  private liveHeaders(): Set<string> {
    if (!this.headers) {
      try {
        const j = JSON.parse(fs.readFileSync(headersFixture(), "utf8")) as { headers?: string[] };
        this.headers = new Set(j.headers ?? []);
      } catch {
        this.headers = new Set();
      }
    }
    return this.headers;
  }

  private sheetRow(op: "insert" | "update", order: OrderRecord, keys?: string[]): void {
    const all = toSheetColumns(order) as Record<string, string>;
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(all)) if (!keys || keys.includes(k)) row[k] = v;
    const headers = this.liveHeaders();
    const unknown_keys = Object.keys(row).filter((k) => !headers.has(k));
    this.append("sheet_rows.jsonl", { op, order_id: order.order_id, row, unknown_keys, at: new Date().toISOString() });
  }

  private replay(): Map<string, OrderRecord> {
    const m = new Map<string, OrderRecord>();
    for (const l of this.readLines<OrderLine>("orders.jsonl")) {
      if (!l || typeof l.order_id !== "string" || !l.data) continue;
      if (l.op === "insert") m.set(l.order_id, { ...(l.data as OrderRecord) });
      else if (l.op === "update" && m.has(l.order_id)) m.set(l.order_id, { ...(m.get(l.order_id) as OrderRecord), ...l.data });
    }
    return m;
  }

  appendTouch(t: StoredTouch): Promise<void> {
    return serial(() => this.append("touches.jsonl", t));
  }

  appendOrder(o: OrderRecord, legacyRow: () => Promise<void>): Promise<void> {
    return serial(async () => {
      if (this.replay().has(o.order_id)) throw new Error(`FileStore: order ${o.order_id} exists`);
      this.append("orders.jsonl", { op: "insert", order_id: o.order_id, data: o, at: new Date().toISOString() });
      this.sheetRow("insert", o);
      await legacyRow();          // a no-op in test mode (getOrderDoc() returns null under STORE_MODE=file)
    });
  }

  async getOrder(order_id: string, _opts?: { fresh?: boolean }): Promise<OrderRecord | null> {
    return this.replay().get(order_id) ?? null;
  }

  async findOrderByProcessId(process_id: string): Promise<OrderRecord | null> {
    if (!process_id) return null;
    for (const o of this.replay().values()) if ((o.grow_process_ids ?? []).includes(process_id)) return o;
    return null;
  }

  updateOrder(order_id: string, patch: Partial<OrderRecord>): Promise<void> {
    return serial(() => {
      const cur = this.replay().get(order_id);
      if (!cur) throw new Error(`FileStore: no order ${order_id}`);
      const { order_id: _ignored, ...data } = patch;
      this.append("orders.jsonl", { op: "update", order_id, data, at: new Date().toISOString() });
      const next = { ...cur, ...data } as OrderRecord;
      const changed = Object.entries(toSheetColumns(next) as Record<string, string>)
        .filter(([k, v]) => (toSheetColumns(cur) as Record<string, string>)[k] !== v).map(([k]) => k);
      if (changed.length) this.sheetRow("update", next, changed);
    });
  }

  appendPayment(p: PaymentRecord): Promise<"inserted" | "duplicate"> {
    return serial(() => {
      if (this.readLines<PaymentRecord>("payments.jsonl").some((x) => x.payment_id === p.payment_id)) return "duplicate" as const;
      this.append("payments.jsonl", p);
      return "inserted" as const;
    });
  }

  async getPayment(payment_id: string): Promise<PaymentRecord | null> {
    return this.readLines<PaymentRecord>("payments.jsonl").find((x) => x.payment_id === payment_id) ?? null;
  }

  async getCode(code: string): Promise<TrackingCode | null> {
    const list = this.readJson<TrackingCode[]>("codes.json", []);
    const c = code.toLowerCase();
    return (Array.isArray(list) ? list : []).find((x) => x && String(x.code).toLowerCase() === c) ?? null;
  }

  async getPartnerByCode(code: string): Promise<Partner | null> {
    const u = code.toUpperCase();
    return this.partners().find((p) => String(p.code).toUpperCase() === u) ?? null;
  }

  async getPartnerById(id: string): Promise<Partner | null> {
    const l = id.toLowerCase();
    return this.partners().find((p) => String(p.partner_id).toLowerCase() === l) ?? null;
  }

  private partners(): Partner[] {
    const list = this.readJson<Partner[]>("partners.json", []);
    return Array.isArray(list) ? list.filter((p) => p && typeof p.partner_id === "string") : [];
  }

  async listOrders(): Promise<OrderRecord[]> {
    return [...this.replay().values()];
  }
}
