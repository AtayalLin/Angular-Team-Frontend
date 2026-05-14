/*
 * =====================================================
 * 檔案名稱：order.service.ts
 * 位置說明：src/app/shared/order.service.ts
 * 用途說明：跨元件共享的即時訂單狀態服務
 * 功能說明：
 *   - 維護全部進行中訂單（Signal 驅動）
 *   - 提供依狀態分組的 computed 訂閱
 *   - customer-home 下單 → POS 看板即時同步
 *   - POS 更新狀態 → customer-home 追蹤即時同步
 * =====================================================
 */

import { Injectable, signal, computed } from '@angular/core';

/* ── 訂單狀態型別 ───────────────────────────────────── */
export type OrderStatus =
  | 'pending-cash'
  | 'waiting'
  | 'cooking'
  | 'ready'
  | 'done'
  | 'cancelled'
  | 'paid';

/* ── 即時訂單型別 ───────────────────────────────────── */
export interface LiveOrder {
  id: string;
  number: string;
  status: OrderStatus;
  estimatedMinutes: number;
  items: string[];
  total: number;
  createdAt: string;
  payMethod: string;
  source: 'pos' | 'customer';
  customerName?: string;
  orderType?: string; /* '內用' | '外帶'，POS 下單時帶入 */
  note?: string; /* 備註，選填 */
  isCash?: boolean; // ← 新增，供追蹤頁判斷顯示 3 或 4 步
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  /* ── 全部訂單（含歷史） ─────────────────────────── */
  private _orders = signal<LiveOrder[]>([]);

  /* ── 跨 Tab 同步（BroadcastChannel） ───────────── */
  private _bc = new BroadcastChannel('lbb-order-sync');

  /* 終態：一旦進入就不可再變更 */
  private static readonly TERMINAL: ReadonlySet<OrderStatus> = new Set([
    'done', 'paid', 'cancelled',
  ]);

  constructor() {
    this._bc.onmessage = ({ data }) => {
      if (data?.type === 'ADD_ORDER') {
        const order: LiveOrder = data.order;
        this._orders.update((list) =>
          list.find((o) => o.id === order.id) ? list : [order, ...list],
        );
      } else if (data?.type === 'UPDATE_STATUS') {
        this._orders.update((list) => {
          const idx = list.findIndex((o) => o.id === data.id);
          if (idx === -1) return list;
          const existing = list[idx];
          /* 終態不可被任何廣播覆蓋 */
          if (OrderService.TERMINAL.has(existing.status)) return list;
          const incoming = data.status as OrderStatus;
          const updated = { ...existing, status: incoming };
          return [updated, ...list.filter((_, i) => i !== idx)];
        });
      }
    };
  }

  /* ── 唯讀訂單串流 ───────────────────────────────── */
  readonly orders = this._orders.asReadonly();

  /* ── 依狀態分組（供看板使用） ───────────────────── */
  pendingCash = computed(() =>
    this._orders().filter((o) => o.status === 'pending-cash'),
  );
  waiting = computed(() =>
    this._orders().filter((o) => o.status === 'waiting'),
  );
  cooking = computed(() =>
    this._orders().filter((o) => o.status === 'cooking'),
  );
  ready = computed(() => this._orders().filter((o) => o.status === 'ready'));
  done = computed(() => this._orders().filter((o) => o.status === 'done'));
  paid = computed(() => this._orders().filter((o) => o.status === 'paid'));

  /* ── 最新一筆客戶端訂單（供追蹤頁） ────────────── */
  latestCustomerOrder = computed<LiveOrder | null>(() => {
    const list = this._orders().filter((o) => o.source === 'customer');
    return list.length > 0 ? list[0] : null;
  });

  /* ── 新增訂單 ───────────────────────────────────── */
  addOrder(order: LiveOrder): void {
    this._orders.update((list) => [order, ...list]);
    this._bc.postMessage({ type: 'ADD_ORDER', order });
  }

  /* ── 更新訂單狀態（終態保護：done/paid/cancelled 不可回朔） ── */
  updateStatus(id: string, status: OrderStatus): void {
    this._orders.update((list) => {
      const idx = list.findIndex((o) => o.id === id);
      if (idx === -1) return list;
      if (OrderService.TERMINAL.has(list[idx].status)) return list;
      const updated = { ...list[idx], status };
      return [updated, ...list.filter((_, i) => i !== idx)];
    });
    this._bc.postMessage({ type: 'UPDATE_STATUS', id, status });
  }

  updatePayMethod(id: string, payMethod: string): void {
    this._orders.update((list) =>
      list.map((o) => (o.id === id ? { ...o, payMethod } : o)),
    );
  }

  updatePayMethodAndCash(id: string, payMethod: string, isCash: boolean): void {
    this._orders.update((list) =>
      list.map((o) => (o.id === id ? { ...o, payMethod, isCash } : o)),
    );
  }

  updateItems(id: string, items: string[]): void {
    this._orders.update((list) =>
      list.map((o) => (o.id === id ? { ...o, items } : o)),
    );
  }

  removeOrder(id: string): void {
    this._orders.update((list) => list.filter((o) => o.id !== id));
  }

  /* ── 產生下一個訂單號（格式：YYYYMMDD-XXXX）──────── */
  generateOrderNumber(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;

    const nums = this._orders().map((o) => {
      const m = o.number.match(/\d{8}-(\d+)/);
      return m ? parseInt(m[1]) : 0;
    });
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `${dateStr}-${String(max + 1).padStart(4, '0')}`;
  }

  /* ── 產生訂單 ID ────────────────────────────────── */
  generateOrderId(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    return `LBB-${dateStr}-${String(Date.now()).slice(-4)}`;
  }
}
