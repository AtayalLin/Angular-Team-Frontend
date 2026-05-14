/*
 * =====================================================
 * 檔案名稱：pos-terminal.component.ts
 * 位置說明：src/app/pos-terminal/pos-terminal.component.ts
 * 用途說明：分店長 / 員工 POS 點餐終端機
 * 功能說明：
 *   - 登入保護：只允許 branch_manager / staff 角色
 *   - 頁籤切換（分店長 6 個 / 員工 4 個）
 *   - 商品卡點擊加入購物車
 *   - 購物車增減數量、小計、稅金（5%）、合計
 *   - 滿額贈品提示（小計未達 $300 時顯示）
 *   - 付款方式選擇
 *   - 結帳後推送至 OrderService → 客戶追蹤即時同步
 *   - 訂單看板：依狀態分欄，可拖拉流轉
 *   - 庫存管理：分店長可調整庫存數量（inline 編輯）
 *   - 員工帳號管理：可停/復權（分店長專屬）
 *   - 即時時鐘
 * =====================================================
 */

import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  signal,
  computed,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { gsap } from 'gsap';
import autoAnimate from '@formkit/auto-animate';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

import { AuthService } from '../shared/auth.service';
import { OrderService, LiveOrder } from '../shared/order.service';
import {
  ApiService,
  CartSyncReq,
  CartViewRes,
  AvailableGiftVO,
  PromotionDetailVo,
  CreateOrdersReq,
  OrderCartDetailItem,
  PayReq,
  GetOrdersDetailVo,
  InventoryDetailVo,
  UpdateBranchInventoryReq,
  SelfChangePasswordReq,
  ProductAdminVo,
} from '../shared/api.service';
import { firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

/* ── 頁籤型別 ──────────────────────────────────────── */
export type PosTab = 'pos' | 'board' | 'stock' | 'promo' | 'staff' | 'report';

interface PosPromoEnriched {
  id: number;
  name: string;
  minThreshold: number;
  qualified: boolean;
  progressPct: number;
  gapAmount: number;
  gifts: AvailableGiftVO[];
}

/* ── 商品型別 ──────────────────────────────────────── */
interface PosProduct {
  id: number;
  name: string;
  eng: string;
  price: number;
  emoji: string;
  bg: string;
  imgSrc?: string;
  badge?: 'hot' | 'new' | 'low';
  stock: number;
  category: string;
  style: string;
}

/* ── 購物車品項型別 ─────────────────────────────────── */
interface CartItem {
  id: number;
  name: string;
  eng: string;
  price: number;
  qty: number;
}

/* ── 活動型別 ───────────────────────────────────────── */
interface PosPromo {
  id: number;
  title: string;
  isActive: boolean;
  color: string;
  ended: boolean;
  rawStartTime: string;
  rawEndTime: string;
  type: 'promotion' | 'announcement';
  description?: string;
  image?: string;
  badgeColor?: string;
  minAmount?: number;
  giftCount?: number;
}

/* ── 待付款現金訂單型別 ─────────────────────────────── */
interface PendingCashOrder {
  posId: string; /* DB-YYYYMMDD-XXXX */
  dbId: string; /* 0001 */
  orderDateId: string; /* YYYYMMDD */
  number: string; /* A-0001 */
  total: number;
  phone: string;
  items: string[];
  createdAt: string;
}

/* ── 員工帳號型別 ───────────────────────────────────── */
interface StaffAccount {
  id: number;
  name: string;
  account: string;
  backendRole: string;
  isActive: boolean;
  joinedAt: string;
}

@Component({
  selector: 'app-pos-terminal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pos-terminal.component.html',
  styleUrls: ['./pos-terminal.component.scss'],
})
export class PosTerminalComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('cartListEl') private cartListEl!: ElementRef<HTMLElement>;
  @ViewChild('totalEl') private totalEl!: ElementRef<HTMLElement>;
  @ViewChild('checkoutBtnEl') private checkoutBtnEl!: ElementRef<HTMLElement>;

  /* ── 即時時鐘 ─────────────────────────────────────── */
  clockStr = signal('');

  /* ── 目前頁籤 ─────────────────────────────────────── */
  activeTab = signal<PosTab>('pos');

  /* ── 付款方式 ─────────────────────────────────────── */
  payMethod = signal<'cash' | 'card' | 'mobile'>('cash');

  /* ── 訂單類型（內用 / 外帶）────────────────────────── */
  orderType = signal<'dine-in' | 'takeout'>('dine-in');

  /* ── 備註（收銀員輸入）──────────────────────────────── */
  orderNote = signal('');

  /* ── 分類篩選 ─────────────────────────────────────── */
  activeCategory = signal<string>('all');

  /* ── 風格篩選 ─────────────────────────────────────── */
  activeStyle = signal<string>('all');

  /* ── 搜尋關鍵字 ───────────────────────────────────── */
  searchQuery = signal<string>('');

  /* ── 結帳成功狀態 ─────────────────────────────────── */
  checkoutSuccess = signal(false);
  lastOrderNum = signal('');

  /* ── 購物車 ───────────────────────────────────────── */
  cartItems = signal<CartItem[]>([]);

  subtotal = computed(() =>
    this.cartItems().reduce((sum, item) => sum + item.price * item.qty, 0),
  );
  /* 合計 = 小計（台灣不另加營業稅） */
  total = computed(() => this.subtotal());

  showPromoHint = computed(() => this.subtotal() > 0 && this.subtotal() < 300);
  promoRemain = computed(() => 300 - this.subtotal());

  /* ── 商品清單（Signal 化，支援庫存調整）──────────
   * 初始為空；ngOnInit 透過 loadStockList() 從後端填入
   * ──────────────────────────────────────────────── */
  products = signal<PosProduct[]>([]);

  /* 篩選後商品清單 */
  filteredProducts = computed(() => {
    const cat = this.activeCategory();
    const sty = this.activeStyle();
    const q = this.searchQuery().trim().toLowerCase();
    return this.products().filter((p) => {
      const catMatch = cat === 'all' || p.category === cat;
      const styMatch = sty === 'all' || p.style === sty;
      const nameMatch =
        q === '' ||
        p.name.toLowerCase().includes(q) ||
        p.eng.toLowerCase().includes(q);
      return catMatch && styMatch && nameMatch;
    });
  });

  /* 動態分類清單（從已載入商品推算；後端資料未就緒時顯示空列表） */
  uniqueCategories = computed(() => {
    const cats = [
      ...new Set(
        this.products()
          .map((p) => p.category)
          .filter(Boolean),
      ),
    ] as string[];
    return cats;
  });

  /* 動態風格清單（從已載入商品推算；後端資料未就緒時顯示空列表） */
  uniqueStyles = computed(() => {
    const styles = [
      ...new Set(
        this.products()
          .map((p) => p.style)
          .filter(Boolean),
      ),
    ] as string[];
    return styles;
  });

  /* ── 新增員工 Modal 狀態 ──────────────────────────── */
  showAddStaffModal = signal(false);
  newStaffName = signal('');
  newStaffAccount = signal('');
  newStaffPassword = signal('');

  showEditStaffModal = signal(false);
  editStaffId = signal<number | null>(null);
  editStaffDraft: { name: string; password: string; backendRole: string } = {
    name: '',
    password: '',
    backendRole: 'STAFF',
  };

  /* ── 活動管理 ─────────────────────────────────────── */
  /* 初始為空；ngOnInit 透過 getPromotionsList() 從後端填入 */
  posPromos = signal<PosPromo[]>([]);
  showPosPromoPanel = signal(false);
  posPromoDraft = {
    name: '',
    description: '',
    startTime: '',
    endTime: '',
    badgeColor: '#c49756',
    minAmount: null as number | null,
    image: '',
    currency: 'NT$',
  };
  posToastMsg = signal('');
  private posToastTimer: any = null;

  /* ── 待付款現金訂單（客戶端現金下單，尚未至櫃台付款）── */
  pendingCashOrders = signal<PendingCashOrder[]>([]);
  confirmingCashId = signal<string | null>(null); /* 收款中的訂單 posId */

  /* ── 會員/訪客模式 ─────────────────────────────────
   * 'none'   = 未選擇（顯示選擇按鈕）
   * 'member' = 已查詢會員（顯示會員資料 + 折扣進度條）
   * 'guest'  = 訪客（顯示手機號碼輸入欄）
   * ──────────────────────────────────────────────── */
  orderMode = signal<'none' | 'member' | 'guest'>('none');

  /* 查詢會員用的輸入（email 或手機號碼） */
  memberQuery = signal('');
  memberQueryError = signal('');

  /* 查詢到的會員資訊（不含密碼） */
  foundMember = signal<{
    id: number;
    name: string;
    phone: string;
    email: string;
    orderCount: number;
  } | null>(null);

  /* 訪客手機號碼 */
  guestPhone = signal('');

  /* ── 購物車後端 sync 狀態 ─────────────────────────── */
  cartSyncRes = signal<CartViewRes | null>(null);
  posSyncCartId = signal<number | null>(null);
  private _posCartSyncQueue: Promise<void> = Promise.resolve();

  /* ── 活動/贈品選擇（後端驅動）──────────────────────── */
  posAllPromos = signal<PromotionDetailVo[]>([]);
  selectedPromoDetail = signal<PromotionDetailVo | null>(null);

  openPromoDetail(id: number): void {
    const detail = this.posAllPromos().find((p) => p.id === id) ?? null;
    this.selectedPromoDetail.set(detail);
  }

  closePromoDetail(): void {
    this.selectedPromoDetail.set(null);
  }
  posPromoDrawerOpen = signal(false);
  selectedPosPromoId = signal<number | null>(null); // null=未選, -1=不參加
  selectedPosGiftRuleId = signal<number | null>(null);

  posAvailablePromos = computed(
    () => this.cartSyncRes()?.availablePromotions ?? [],
  );

  posSelectedPromo = computed(() => {
    const id = this.selectedPosPromoId();
    if (!id || id < 0) return null;
    /* 若選中的活動已不符合門檻，視為未選 */
    const enriched = this.posEnrichedPromos().find((p) => p.id === id);
    if (!enriched?.qualified) return null;
    return this.posAvailablePromos().find((p) => p.promotionId === id) ?? null;
  });

  posSelectedGiftName = computed(() => {
    const ruleId = this.selectedPosGiftRuleId();
    if (!ruleId || ruleId < 0) return '';
    return (
      this.posSelectedPromo()?.gifts.find((g) => g.giftRuleId === ruleId)
        ?.giftProductName ?? ''
    );
  });

  posEnrichedPromos = computed((): PosPromoEnriched[] => {
    const available = this.posAvailablePromos();
    const sub = this.subtotal();
    const now = new Date();

    return (
      this.posAllPromos()
        .filter(
          (p) =>
            p.active &&
            new Date(p.endTime) > now &&
            p.gifts.some((g) => g.active),
        )
        .map((promo) => {
          const activeGifts = promo.gifts.filter((g) => g.active);
          const minThreshold = Math.min(
            ...activeGifts.map((g) => g.fullAmount),
          );
          /* minThreshold=0 表示無門檻，直接符合；否則需達門檻 */
          const qualified = minThreshold === 0 ? sub > 0 : sub >= minThreshold;
          const progressPct =
            minThreshold > 0
              ? Math.min(100, Math.round((sub / minThreshold) * 100))
              : 100;
          const gapAmount = Math.max(0, minThreshold - sub);
          const availPromo = available.find((a) => a.promotionId === promo.id);
          /* 依 giftRuleId 去重，避免後端回傳重複贈品品項 */
          const rawGifts = availPromo?.gifts ?? [];
          const seen = new Set<number>();
          const gifts = rawGifts.filter((g) => {
            if (seen.has(g.giftRuleId)) return false;
            seen.add(g.giftRuleId);
            return true;
          });
          return {
            id: promo.id,
            name: promo.name,
            minThreshold,
            qualified,
            progressPct,
            gapAmount,
            gifts,
          };
        })
        /* 由低到高升冪排列 */
        .sort((a, b) => a.minThreshold - b.minThreshold)
    );
  });

  selectPosPromo(promoId: number): void {
    if (promoId > 0 && this.selectedPosPromoId() === promoId) {
      this.selectedPosPromoId.set(null);
    } else {
      this.selectedPosPromoId.set(promoId);
    }
    this.selectedPosGiftRuleId.set(null);
  }

  pickPosGift(ruleId: number | null): void {
    this.selectedPosGiftRuleId.set(ruleId);
  }

  private _syncCartToBackend(productId: number, quantity: number): void {
    this._posCartSyncQueue = this._posCartSyncQueue.then(async () => {
      const staff = this.authService.currentStaff;
      const globalAreaId = staff?.globalAreaId ?? 19;
      const memberId = this.foundMember()?.id ?? 1;
      const req: CartSyncReq = {
        cartId: this.posSyncCartId(),
        globalAreaId,
        productId,
        quantity,
        operationType: 'STAFF',
        memberId,
        staffId: staff?.id,
      };
      try {
        const res = await firstValueFrom(this.apiService.syncCart(req));
        if (res.cartId > 0) this.posSyncCartId.set(res.cartId);
        this.cartSyncRes.set(res);
        /* 若已選活動不再符合資格，自動重置選擇 */
        const availIds = res.availablePromotions.map((p) => p.promotionId);
        const cur = this.selectedPosPromoId();
        if (cur && cur > 0 && !availIds.includes(cur)) {
          this.selectedPosPromoId.set(null);
          this.selectedPosGiftRuleId.set(null);
        }
      } catch {
        /* 靜默失敗，不影響收銀作業 */
      }
    });
  }

  private resetPosPromoState(): void {
    this.posSyncCartId.set(null);
    this.cartSyncRes.set(null);
    this.selectedPosPromoId.set(null);
    this.selectedPosGiftRuleId.set(null);
    this.posPromoDrawerOpen.set(false);
  }

  /* ── 折扣兌換券（與客戶端相同邏輯）────────────────── */
  useDiscountCoupon = signal(false);

  toggleDiscountCoupon(): void {
    this.useDiscountCoupon.update((v) => !v);
  }

  /* 本次 Session 的會員訂單次數（getMemberByPhone 回傳後載入，結帳後即時更新） */
  posOrderCount = signal<number>(0);
  /* 該會員所在國家的折扣門檻（從 regions.usageCap 讀取，預設 2） */
  posDiscountThreshold = signal<number>(2);
  private regionsUsageCap = new Map<number, number>();

  /* 切換成會員點餐模式 */
  enterMemberMode(): void {
    this.orderMode.set('member');
    this.memberQuery.set('');
    this.memberQueryError.set('');
    this.foundMember.set(null);
  }

  /* 切換成訪客模式 */
  enterGuestMode(): void {
    this.orderMode.set('guest');
    this.guestPhone.set('');
    this.foundMember.set(null);
    this.posOrderCount.set(0);
  }

  /* 取消，回到未選擇狀態 */
  cancelOrderMode(): void {
    this.orderMode.set('none');
    this.foundMember.set(null);
    this.posOrderCount.set(0);
    this.memberQuery.set('');
    this.memberQueryError.set('');
    this.guestPhone.set('');
    this.useDiscountCoupon.set(false);
    this.resetPosPromoState();
  }

  /* 查詢會員（比對時去除所有 dash，讓使用者輸入 0912345678 也能找到） */
  lookupMember(): void {
    const q = this.memberQuery().trim();
    if (!q) {
      this.memberQueryError.set('請輸入會員 Email 或手機號碼');
      return;
    }

    /* 格式正規化交由後端處理，前端只去除連字號與空白 */
    const phone = q.replace(/[\s\-]/g, '');

    this.apiService.getMemberByPhone(phone).subscribe({
      next: (res) => {
        const d = res?.data;
        if (res?.code === 200 && d?.memberId) {
          this.foundMember.set({
            id: d.memberId,
            name: d.phone ?? '會員',
            phone: d.phone ?? '',
            email: '',
            orderCount: d.orderCount ?? 0,
          });
          this.posOrderCount.set(d.orderCount ?? 0);
          const threshold = this.regionsUsageCap.get(d.regionsId ?? 0) ?? 2;
          this.posDiscountThreshold.set(threshold);
          this.memberQueryError.set('');
        } else {
          this.foundMember.set(null);
          this.posOrderCount.set(0);
          this.posDiscountThreshold.set(2);
          this.memberQueryError.set('查無此會員，請確認手機號碼');
        }
      },
      error: () => this.memberQueryError.set('查詢失敗，請確認後端連線'),
    });
  }

  /* 會員訂單次數累積進度（依折扣門檻計算百分比） */
  get memberOrderCountPct(): number {
    const count = this.posOrderCount();
    const n = this.posDiscountThreshold();
    if (count === 0 || n === 0) return 0;
    return Math.min(100, (count % n === 0 ? n : count % n) * (100 / n));
  }

  /* 距離下一張折扣券還差幾次 */
  get memberOrdersUntilCoupon(): number {
    const count = this.posOrderCount();
    const n = this.posDiscountThreshold();
    const rem = count % n;
    if (rem === 0 && count > 0) return 0;
    return n - rem;
  }

  /* 會員訂單是否達成折扣券 */
  get memberHasDiscountReady(): boolean {
    const count = this.posOrderCount();
    const n = this.posDiscountThreshold();
    return count > 0 && count % n === 0;
  }

  /* 折扣後合計（使用折扣券時 8 折） */
  get discountedTotal(): number {
    if (this.useDiscountCoupon()) {
      return Math.round(this.subtotal() * 0.8);
    }
    return this.subtotal();
  }

  /* 折扣省下金額 */
  get discountAmount(): number {
    return this.subtotal() - this.discountedTotal;
  }

  /* ── 庫存管理頁專用清單（含未上架商品，來自 getBranchInventory）── */
  posStockList = signal<InventoryDetailVo[]>([]);

  /* ── 庫存調整狀態 ─────────────────────────────────── */
  adjustingStockId = signal<number | null>(null);
  adjustStockAmount = signal<number>(0);
  adjustStockSavedId = signal<number | null>(null);

  /* ── 員工帳號清單（Signal 化）初始為空；BM 角色在 ngOnInit 透過 getAllStaff() 填入 ── */
  staffAccounts = signal<StaffAccount[]>([]);

  /* ── 報電話號碼取餐 ───────────────────────────────── */
  phoneQuery = signal('');
  phoneSearchLoading = signal(false);
  phoneSearchResults = signal<import('../shared/api.service').GetOrdersVo[]>(
    [],
  );
  phoneSearchDone = signal(false);
  phoneSearchError = signal('');

  /* 計時器 ID */
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  /* POS 看板輪詢計時器 */
  private boardPollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    public router: Router,
    public authService: AuthService,
    public orderService: OrderService,
    protected apiService: ApiService,
  ) {}

  ngOnInit(): void {
    const user = this.authService.currentUser;
    if (
      !user ||
      (user.role !== 'branch_manager' &&
        user.role !== 'deputy_manager' &&
        user.role !== 'staff')
    ) {
      this.router.navigate(['/staff-login']);
      return;
    }
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);

    /* 立即拉一次今日訂單，之後每 5 秒輪詢 */
    this._fetchTodayOrders();
    this.boardPollInterval = setInterval(() => this._fetchTodayOrders(), 5000);

    this.loadStockList();
    this.apiService.getAllTax().subscribe({
      next: (res) => {
        if (res.code === 200) {
          res.regionsList?.forEach((r) => {
            if (r.id && r.usageCap) this.regionsUsageCap.set(r.id, r.usageCap);
          });
        }
      },
    });
    this.apiService.getPromotionsList().subscribe({
      next: (res) => {
        if (res?.data?.length) {
          this.posAllPromos.set(res.data);
          this.posPromos.set(
            res.data.map((p) => ({
              id: p.id,
              title: p.name,
              isActive: p.active,
              color: p.active ? '#c49756' : '#6b7280',
              ended: !!p.endTime && new Date(p.endTime) < new Date(),
              rawStartTime: p.startTime,
              rawEndTime: p.endTime,
              type: 'promotion' as const,
              description: p.description ?? '',
              image: p.promotionImg
                ? `${this.apiService.getPromotionImageUrl(p.id)}?v=${p.id}`
                : '',
              badgeColor: p.active ? '#c49756' : '#6b7280',
              minAmount: p.gifts?.length
                ? Math.min(...p.gifts.map((g) => +g.fullAmount))
                : undefined,
              giftCount: p.gifts?.length ?? 0,
            })),
          );
        }
      },
      error: () => console.warn('[POS] 活動 API 失敗，使用本機 Demo 資料'),
    });
    if (this.isBM) {
      this.apiService.getAllStaff().subscribe({
        next: (staffRes) => {
          if (staffRes?.staffList?.length) {
            this.staffAccounts.set(
              staffRes.staffList
                .filter(
                  (s) => s.role !== 'ADMIN' && s.role !== 'REGION_MANAGER',
                )
                .map((s) => ({
                  id: s.id,
                  name: s.name,
                  account: s.account,
                  backendRole: s.role,
                  isActive: s.status ?? true,
                  joinedAt: s.hireAt?.slice(0, 10) ?? '',
                })),
            );
          }
        },
        error: () => console.warn('[POS] 員工清單載入失敗'),
      });
    }
  }

  ngAfterViewInit(): void {
    if (this.cartListEl?.nativeElement) {
      autoAnimate(this.cartListEl.nativeElement, { duration: 180 });
    }
  }

  ngOnDestroy(): void {
    if (this.clockInterval !== null) clearInterval(this.clockInterval);
    if (this.boardPollInterval !== null) clearInterval(this.boardPollInterval);
  }

  /* 從後端拉今日訂單，同步至 OrderService（已付款）或 pendingCashOrders（待付款） */
  private _fetchTodayOrders(): void {
    this.apiService.getTodayOrders().subscribe({
      next: (res) => {
        if (res?.code === 403) {
          /* 員工 session 已過期，停止輪詢並導回登入 */
          if (this.boardPollInterval !== null) {
            clearInterval(this.boardPollInterval);
            this.boardPollInterval = null;
          }
          this.authService.sessionExpired.set(true);
          return;
        }
        if (!res?.getOrderVoList) return;
        const pad = (n: number) => String(n).padStart(2, '0');
        const now = new Date();
        const nowStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

        /* 依 DB id 升序排序，index + 1 即為今日流水號（0001、0002…） */
        const sortedList = [...res.getOrderVoList].sort(
          (a, b) => parseInt(a.id) - parseInt(b.id),
        );

        sortedList.forEach((o, idx) => {
          const existingId = `DB-${o.orderDateId}-${o.id}`;

          const rawDetails: GetOrdersDetailVo[] =
            o.GetOrdersDetailVoList ?? o.getOrdersDetailVoList ?? [];
          const itemTexts: string[] = rawDetails
            .filter((i) => !i.gift)
            .map(
              (i) => `${i.name || i.productName || '未知品項'} × ${i.quantity}`,
            );

          /* ── 付款方式：後端已回傳 paymentMethod 欄位 ── */
          const rawPayment: string = o.paymentMethod ?? o.payMethod ?? '';
          const payStatus: string = o.payStatus ?? o.paymentStatus ?? '';
          const isCash =
            rawPayment === 'CASH' ||
            (payStatus === 'UNPAID' && rawPayment === '') ||
            o.ordersStatus === 'PENDING_CASH' ||
            o.kitchenStatus === 'PENDING_CASH';

         /* ── 狀態映射：所有 READY 訂單進「餐點製作完成」，由員工手動完成 ── */
          const statusMap: Record<
            string,
            'pending-cash' | 'waiting' | 'cooking' | 'ready' | 'done'
          > = {
            PENDING_CASH: 'pending-cash',
            UNPAID: 'pending-cash',
            WAITING: 'waiting',
            COOKING: 'cooking',
            READY: 'ready',
            AWAITING_PAYMENT: 'pending-cash',
            COMPLETED: 'done',
            PICKED_UP: 'done',
          };
          const rawStatus = (o.kitchenStatus ?? '') || o.ordersStatus;
          const status =
            o.ordersStatus === 'AWAITING_PAYMENT'
              ? 'pending-cash'
              : (statusMap[rawStatus] ??
                statusMap[o.ordersStatus] ??
                'waiting');

          const payMethod =
            o.ordersStatus === 'COMPLETED'
              ? '已付款'
              : isCash
                ? '現金'
                : rawPayment === 'CREDIT_CARD'
                  ? '信用卡'
                  : rawPayment === 'MOBILE_PAY'
                    ? '行動支付'
                    : '待付款';

          const orderNumber = `${o.orderDateId}-${String(idx + 1).padStart(4, '0')}`;
          /* 同時比對 DB id 和 number，避免 POS 下單後 polling 重複新增 */
          const existing =
            this.orderService.orders().find((x) => x.id === existingId) ??
            this.orderService.orders().find((x) => x.number === orderNumber);
          if (!existing) {
            /* 頁面載入時，已是終態的舊訂單不塞進看板 */
            if (status === 'done') return;
            this.orderService.addOrder({
              id: existingId,
              number: orderNumber,
              status,
              estimatedMinutes: 10,
              items: itemTexts,
              total: Number(o.totalAmount),
              createdAt: nowStr,
              payMethod,
              isCash,
              source: 'customer',
              customerName: '',
              orderType: (o.phone ?? '').startsWith('GUEST') ? '訪客' : '會員',
            } as LiveOrder);
          } else {
            const targetId = existing.id;
            /* 輪詢只允許狀態往前推進，終態(done/paid/cancelled)完全鎖定 */
            const isTerminal =
              existing.status === 'done' ||
              existing.status === 'paid' ||
              existing.status === 'cancelled';
            if (!isTerminal) {
              const statusLevel: Record<string, number> = {
                waiting: 0, cooking: 1, ready: 2, 'pending-cash': 3, done: 4,
              };
              const existingLevel = statusLevel[existing.status] ?? 0;
              const newLevel = statusLevel[status] ?? 0;
              if (newLevel > existingLevel) {
                this.orderService.updateStatus(targetId, status);
              }
            }
            if (
              isCash &&
              (!existing.isCash || existing.payMethod === '待付款')
            ) {
              this.orderService.updatePayMethodAndCash(targetId, '現金', true);
            } else if (
              existing.payMethod === '待付款' &&
              payMethod !== '待付款'
            ) {
              this.orderService.updatePayMethod(targetId, payMethod);
            }
            if (itemTexts.length > 0 && existing.items.length === 0) {
              this.orderService.updateItems(targetId, itemTexts);
            }
          }
        });
      },
      error: () => {},
    });
  }

  /* 判斷是否為分店長 */
  get isBM(): boolean {
    const role = this.authService.currentUser?.role;
    return role === 'branch_manager' || role === 'deputy_manager';
  }

  /* 更新時鐘 */
  private updateClock(): void {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const day = days[now.getDay()];
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    this.clockStr.set(`${yyyy}/${mo}/${dd} 星期${day} ${hh}:${mm}:${ss}`);
  }

  /* 切換頁籤 */
  setTab(tab: PosTab): void {
    if (tab === 'staff' && !this.isBM) return;
    this.activeTab.set(tab);
    setTimeout(() => {
      const panel = document.querySelector<HTMLElement>(
        '.page-panel, .pos-main',
      );
      if (panel)
        gsap.fromTo(
          panel,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' },
        );
    }, 0);
  }

  /* GSAP：合計數字彈跳（加入/移除品項時呼叫） */
  private animateTotal(): void {
    setTimeout(() => {
      const el = this.totalEl?.nativeElement;
      if (!el) return;
      gsap.fromTo(
        el,
        { scale: 1.07 },
        { scale: 1, duration: 0.24, ease: 'back.out(3)' },
      );
    }, 0);
  }

  /* 加入購物車，並同步扣減本地庫存顯示 */
  addToCart(product: PosProduct, event?: MouseEvent): void {
    if (product.stock <= 0) {
      this.posShowToast('⚠️ 此商品庫存不足');
      return;
    }
    const current = this.cartItems();
    const existing = current.find((c) => c.id === product.id);
    if (existing) {
      this.cartItems.set(
        current.map((c) =>
          c.id === product.id ? { ...c, qty: c.qty + 1 } : c,
        ),
      );
      this._syncCartToBackend(product.id, existing.qty + 1);
    } else {
      this.cartItems.set([
        ...current,
        {
          id: product.id,
          name: product.name,
          eng: product.eng,
          price: product.price,
          qty: 1,
        },
      ]);
      this._syncCartToBackend(product.id, 1);
    }
    /* 扣減本地庫存顯示 */
    this.products.update((list) =>
      list.map((p) => (p.id === product.id ? { ...p, stock: p.stock - 1 } : p)),
    );
    if (navigator.vibrate) navigator.vibrate(25);
    if (event?.currentTarget) {
      gsap.fromTo(
        event.currentTarget as HTMLElement,
        { scale: 0.95 },
        { scale: 1, duration: 0.18, ease: 'back.out(3)' },
      );
    }
    this.animateTotal();
  }

  /* 增減數量，並同步調整本地庫存顯示 */
  updateQty(id: number, delta: number): void {
    const current = this.cartItems();
    const item = current.find((c) => c.id === id);
    if (!item) return;
    const newQty = item.qty + delta;
    if (newQty <= 0) {
      /* 移除品項：將整個 qty 還回庫存 */
      this.products.update((list) =>
        list.map((p) =>
          p.id === id ? { ...p, stock: p.stock + item.qty } : p,
        ),
      );
      this.cartItems.set(current.filter((c) => c.id !== id));
      this._syncCartToBackend(id, 0);
    } else {
      /* delta < 0 (減少) → 還回庫存；delta > 0 (增加) → 扣減庫存 */
      const productInCart = this.products().find((p) => p.id === id);
      if (delta > 0 && productInCart && productInCart.stock <= 0) {
        this.posShowToast('⚠️ 此商品庫存不足');
        return;
      }
      this.products.update((list) =>
        list.map((p) => (p.id === id ? { ...p, stock: p.stock - delta } : p)),
      );
      this.cartItems.set(
        current.map((c) => (c.id === id ? { ...c, qty: newQty } : c)),
      );
      this._syncCartToBackend(id, newQty);
    }
    this.animateTotal();
  }

  /* 清空購物車，歸還所有庫存顯示 */
  clearCart(): void {
    const items = this.cartItems();
    items.forEach((item) => {
      this.products.update((list) =>
        list.map((p) =>
          p.id === item.id ? { ...p, stock: p.stock + item.qty } : p,
        ),
      );
    });
    this.cartItems.set([]);
    this.orderNote.set('');
  }

  /* 直接移除單一品項，歸還庫存顯示 */
  removeItem(id: number): void {
    const item = this.cartItems().find((c) => c.id === id);
    if (item) {
      this.products.update((list) =>
        list.map((p) =>
          p.id === id ? { ...p, stock: p.stock + item.qty } : p,
        ),
      );
    }
    this.cartItems.update((list) => list.filter((c) => c.id !== id));
    this.animateTotal();
  }

  /* ── 現金計算器狀態 ───────────────────────────────── */
  showCashCalc = signal(false); /* 是否顯示現金計算鍵盤 */
  cashInput = signal(''); /* 收銀員輸入的收取金額（字串） */

  /* 收取金額（數字） */
  get cashReceived(): number {
    return parseInt(this.cashInput(), 10) || 0;
  }

  /* 找零金額 */
  get cashChange(): number {
    return this.cashReceived - this.discountedTotal;
  }

  /* ── 結帳 Modal（看板內現金結帳）─────────────────── */
  checkoutModalOrder = signal<LiveOrder | null>(null);
  checkoutCashInput = signal('');

  get checkoutCashReceived(): number {
    return parseInt(this.checkoutCashInput(), 10) || 0;
  }

  get checkoutCashChange(): number {
    const order = this.checkoutModalOrder();
    return order ? this.checkoutCashReceived - order.total : 0;
  }

  checkoutQuickAmounts(total: number): number[] {
    const c100 = Math.ceil(total / 100) * 100;
    const c500 = Math.ceil(total / 500) * 500;
    const c1000 = Math.ceil(total / 1000) * 1000;
    return [...new Set([c100, c500, c1000])].filter((v) => v >= total).slice(0, 3);
  }

  moveToUnpaid(id: string): void {
    this.orderService.updateStatus(id, 'pending-cash');
  }

  openCheckoutModal(order: LiveOrder): void {
    this.checkoutModalOrder.set(order);
    this.checkoutCashInput.set('');
  }

  closeCheckoutModal(): void {
    this.checkoutModalOrder.set(null);
    this.checkoutCashInput.set('');
  }

  checkoutKeyPress(key: string): void {
    if (key === 'C') { this.checkoutCashInput.set(''); return; }
    if (key === 'BS') { this.checkoutCashInput.update(v => v.slice(0, -1)); return; }
    if (this.checkoutCashInput().length >= 6) return;
    this.checkoutCashInput.update(v => v + key);
  }

  async confirmCheckoutPayment(): Promise<void> {
    const order = this.checkoutModalOrder();
    if (!order) return;
    await this.completeCashOrder(order);
    this.closeCheckoutModal();
  }

  /* 常見快速金額按鈕 */
  get quickCashAmounts(): number[] {
    const t = this.discountedTotal;
    /* 向上取整至 100 / 500 / 1000 */
    const c100 = Math.ceil(t / 100) * 100;
    const c500 = Math.ceil(t / 500) * 500;
    const c1000 = Math.ceil(t / 1000) * 1000;
    const set = new Set([t, c100, c500, c1000]);
    return Array.from(set).sort((a, b) => a - b);
  }

  /* 鍵盤按鍵輸入 */
  cashKeyPress(key: string): void {
    if (key === 'C') {
      this.cashInput.set('');
      return;
    }
    if (key === 'BS') {
      this.cashInput.update((v) => v.slice(0, -1));
      return;
    }
    /* 限制最大 6 位數 */
    if (this.cashInput().length >= 6) return;
    this.cashInput.update((v) => v + key);
  }

  /* 快速金額按鈕 */
  setCashAmount(amount: number): void {
    this.cashInput.set(String(amount));
  }

  /* 未填會員電話/訪客 → 結帳攔截 modal */
  showNoMemberModal = signal(false);
  /* 會員模式但未按查詢 → 結帳攔截 modal */
  showMemberNotQueriedModal = signal(false);
  /* 防止重複結帳 */
  isCheckingOut = signal(false);

  /* 點擊結帳：若選現金 → 顯示計算器；其他方式直接結帳 */
  onCheckoutClick(): void {
    if (this.cartItems().length === 0) return;
    if (this.orderMode() === 'none') {
      this.showNoMemberModal.set(true);
      return;
    }
    if (this.orderMode() === 'member' && !this.foundMember()) {
      this.showMemberNotQueriedModal.set(true);
      return;
    }
    const btn = this.checkoutBtnEl?.nativeElement;
    if (btn)
      gsap.fromTo(
        btn,
        { scale: 0.96 },
        { scale: 1, duration: 0.2, ease: 'back.out(2)' },
      );
    if (this.payMethod() === 'cash') {
      this.cashInput.set('');
      this.showCashCalc.set(true);
    } else {
      this.confirmCheckout();
    }
  }

  /* 取消現金計算 */
  cancelCashCalc(): void {
    this.showCashCalc.set(false);
    this.cashInput.set('');
  }

  /* ── 確認結帳：推送至後端 + OrderService ────────────── */
  async confirmCheckout(): Promise<void> {
    if (this.cartItems().length === 0) return;
    if (this.isCheckingOut()) return;
    this.isCheckingOut.set(true);

    const staff = this.authService.currentStaff;
    const globalAreaId = staff?.globalAreaId ?? 19;
    const isGuestMode = this.orderMode() === 'guest';
    const memberId = isGuestMode ? 1 : (this.foundMember()?.id ?? 1);
    const rawGuestPhone = this.guestPhone();
    const phone = isGuestMode
      ? rawGuestPhone
        ? /^09\d{8}$/.test(rawGuestPhone)
          ? '+886' + rawGuestPhone.slice(1)
          : rawGuestPhone
        : 'GUEST000'
      : (this.foundMember()?.phone ?? '');
    const total = this.discountedTotal;
    const items = this.cartItems();
    const payMethodMap: Record<string, string> = {
      cash: 'CASH',
      card: 'CREDIT_CARD',
      mobile: 'MOBILE_PAY',
    };
    const payMethod = payMethodMap[this.payMethod()] ?? 'CASH';

    try {
      let cartId: number | null = null;
      for (const item of items) {
        const syncReq: CartSyncReq = {
          cartId,
          globalAreaId,
          productId: item.id,
          quantity: item.qty,
          operationType: 'STAFF',
          memberId,
          staffId: staff?.id,
        };
        const syncRes = await firstValueFrom(this.apiService.syncCart(syncReq));
        cartId = syncRes.cartId;
      }

      /* 若選了贈品，加入訂單明細 */
      const giftRuleId = this.selectedPosGiftRuleId() ?? 0;
      const selectedGift = giftRuleId > 0
        ? this.posSelectedPromo()?.gifts.find((g) => g.giftRuleId === giftRuleId)
        : null;
      const giftDetailItem: OrderCartDetailItem[] =
        giftRuleId > 0 && selectedGift?.giftProductId
          ? [
              {
                productId: selectedGift.giftProductId,
                quantity: 1,
                gift: true,
                promotionsGiftsId: giftRuleId,
              },
            ]
          : [];

      const orderRes = await firstValueFrom(
        this.apiService.createOrder({
          orderCartId: String(cartId!),
          globalAreaId,
          memberId,
          phone,
          subtotalBeforeTax: total,
          taxAmount: 0,
          totalAmount: total,
          useDiscount: this.useDiscountCoupon(),
          orderCartDetailsList: [
            ...items.map((i) => ({
              productId: i.id,
              quantity: i.qty,
              gift: false,
            })),
            ...giftDetailItem,
          ],
          promotionsId: giftRuleId > 0 ? (this.selectedPosPromoId() ?? 0) : 0,
        } as CreateOrdersReq),
      );

      if (orderRes.code !== 200) {
        this.posShowToast(`⚠️ ${orderRes.message}`);
        return;
      }

      await firstValueFrom(
        this.apiService.pay({
          id: orderRes.id,
          orderDateId: orderRes.orderDateId,
          paymentMethod: payMethod,
          transactionId:
            payMethod === 'CASH' ? 'CASH_PAYMENT' : `POS_${Date.now()}`,
          totalAmount: orderRes.totalAmount,
        } as PayReq),
      );

      /* 結帳成功後批次扣減後端庫存 */
      const stockList = this.posStockList();
      const inventoryUpdates: UpdateBranchInventoryReq[] = items
        .map((cartItem) => {
          const inv = stockList.find((s) => s.productId === cartItem.id);
          if (!inv) return null;
          return {
            productId: cartItem.id,
            globalAreaId,
            stockQuantity: Math.max(0, inv.stockQuantity - cartItem.qty),
            basePrice: inv.basePrice,
            costPrice: inv.costPrice,
            maxOrderQuantity: inv.maxOrderQuantity,
            active: inv.active,
          } as UpdateBranchInventoryReq;
        })
        .filter((r): r is UpdateBranchInventoryReq => r !== null);

      if (inventoryUpdates.length > 0) {
        await firstValueFrom(
          this.apiService.deductInventoryBatch(inventoryUpdates),
        );
      }
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const orderId = `DB-${orderRes.orderDateId}-${orderRes.id}`;
      const orderNum = `${orderRes.orderDateId}-${orderRes.id}`;
      const itemTexts = this.cartItems().map((i) => `${i.name} × ${i.qty}`);

      /* 若有滿額贈品（且非「不需要」），一併加入品項列表 */
      const gift = this.posSelectedGiftName();
      if (gift && gift !== '不需要滿額免費贈品') {
        itemTexts.push(`${gift}（滿額贈品）`);
      }

      const totalQty = this.cartItems().reduce((s, i) => s + i.qty, 0);
      const estMin = Math.max(5, Math.ceil(totalQty * 2));
      const payLabels: Record<string, string> = {
        cash: '現金',
        card: '信用卡',
        mobile: '行動支付',
      };

      this.orderService.addOrder({
        id: orderId,
        number: orderNum,
        status: 'waiting',
        estimatedMinutes: estMin,
        items: itemTexts,
        total: this.discountedTotal,
        createdAt: timeStr,
        payMethod: payLabels[this.payMethod()],
        source: 'pos',
        customerName: this.authService.currentUser?.name,
        orderType: this.orderMode() === 'member' ? '會員' : '訪客',
        note: this.orderNote().trim() || undefined,
        isCash: this.payMethod() === 'cash',
      });

      this.lastOrderNum.set(orderNum);
      this.cartItems.set([]);
      this.orderNote.set('');
      this.resetPosPromoState();
      /* 結帳後從後端重新拉庫存，覆蓋本地暫存的扣減值 */
      this.loadStockList();
      this._reloadProductStock(globalAreaId);
      this.showCashCalc.set(false);
      this.cashInput.set('');

      /* 更新會員訂單次數：使用折扣券 → 歸零；未使用 → +1（上限為折扣門檻） */
      if (this.foundMember()) {
        if (this.useDiscountCoupon()) {
          this.posOrderCount.set(0);
        } else {
          this.posOrderCount.update((c) => Math.min(c + 1, this.posDiscountThreshold()));
        }
      }

      /* 重置折扣券 & 贈品 & 活動選擇 */
      this.useDiscountCoupon.set(false);
      this.resetPosPromoState();

      this.checkoutSuccess.set(true);
      setTimeout(() => this.checkoutSuccess.set(false), 3000);
    } catch (err) {
      console.error('[POS] 結帳 API 失敗', err);
      this.posShowToast('⚠️ 訂單送出失敗，請確認後端連線');
    } finally {
      this.isCheckingOut.set(false);
    }
  }

  /* 設定分類篩選 */
  setCategory(cat: string): void {
    this.activeCategory.set(cat);
  }

  /* 設定風格篩選 */
  setStyle(sty: string): void {
    this.activeStyle.set(sty);
  }

  /* 搜尋關鍵字更新 */
  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  /* ── 現金收款確認（PENDING_CASH → COMPLETED → WAITING）── */
  async confirmCashPayment(order: PendingCashOrder): Promise<void> {
    if (this.confirmingCashId() === order.posId) return; /* 防重複點擊 */
    this.confirmingCashId.set(order.posId);
    try {
      const res = await firstValueFrom(
        this.apiService.pay({
          id: order.dbId,
          orderDateId: order.orderDateId,
          paymentMethod: 'CASH',
          transactionId: 'CASH_PAYMENT',
          totalAmount: order.total,
        }),
      );
      if (res?.code === 200) {
        /* 移出待付款列表，下次輪詢會自動帶進廚房看板 */
        this.pendingCashOrders.update((list) =>
          list.filter((p) => p.posId !== order.posId),
        );
        this.posShowToast(`收款完成：${order.number}`);
      } else {
        this.posShowToast('收款失敗，請重試');
      }
    } catch {
      this.posShowToast('收款失敗，請確認後端連線');
    } finally {
      this.confirmingCashId.set(null);
    }
  }

  /* ── 廚房完成後，將現金訂單移至待收款區 ──────────── */
  moveToCashPayment(order: LiveOrder): void {
    this.orderService.updateStatus(order.id, 'pending-cash');
    /* 後端 OrdersStatus enum 無 AWAITING_PAYMENT，pending-cash 純為前端狀態 */
  }

  /* ── 現金收款完成（POS 看板內移動的訂單）────────── */
  async completeCashOrder(order: LiveOrder): Promise<void> {
    /* 線上現金訂單建立時未傳 paymentMethod，後端 DB 存空字串，
     * 故 cash_confirm 永遠回傳 400（paymentMethod != CASH）。
     * 改以 orders_status(PICKED_UP) 直接標記取餐完成。 */
    this.orderService.updateStatus(order.id, 'paid');
    this._pushOrdersStatus(order.id, 'PICKED_UP');
    this.posShowToast(`收款完成：${order.number}`);
  }

  /* ── 訂單看板：狀態流轉 ───────────────────────────── */
  startCooking(id: string): void {
    this.orderService.updateStatus(id, 'cooking');
    this._pushOrdersStatus(id, 'COOKING');
  }

  finishOrder(id: string): void {
    this.orderService.updateStatus(id, 'ready');
    this._pushOrdersStatus(id, 'READY');
  }

  completePickup(id: string): void {
    this.orderService.updateStatus(id, 'done');
    this._pushOrdersStatus(id, 'PICKED_UP');
  }

  private _pushOrdersStatus(
    orderId: string,
    ordersStatus: 'COOKING' | 'READY' | 'PICKED_UP',
  ): void {
    const match = orderId.match(/^DB-(\d{8})-(\d+)$/);
    if (!match) return;
    this.apiService
      .updateOrderStatus({ id: match[2], orderDateId: match[1], ordersStatus })
      .subscribe({
        error: () =>
          console.warn(`[POS] ordersStatus ${ordersStatus} 更新失敗`),
      });
  }
  
  /* ── 載入庫存管理頁清單，同步作為 POS 點餐商品來源 ── */
  private loadStockList(): void {
    const globalAreaId = this.authService.currentStaff?.globalAreaId ?? 19;
    forkJoin({
      inventory: this.apiService.getBranchInventory(globalAreaId).pipe(catchError(() => of(null))),
      allProducts: this.apiService.getAllProducts().pipe(catchError(() => of(null))),
      menu: this.apiService.getActiveProducts(globalAreaId).pipe(catchError(() => of(null))),
      categories: this.apiService.getCategories().pipe(catchError(() => of([]))),
      styles: this.apiService.getStyles().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ inventory, allProducts, menu, categories, styles }) => {
        const categoryMap = new Map<number, string>(categories.map((c) => [c.id, c.name]));
        const styleMap = new Map<number, string>(styles.map((s) => [s.id, s.name]));
        /* MenuVo（/inventory/menu）有 category/style 欄位，作為最終補充來源 */
        const menuCatMap = new Map<number, string>(
          (menu?.data ?? []).map((m) => [m.productId, m.category ?? '']),
        );
        const menuStyleMap = new Map<number, string>(
          (menu?.data ?? []).map((m) => [m.productId, m.style ?? '']),
        );

        const invData = inventory?.data ?? [];
        if (invData.length) {
          this.posStockList.set(invData);
        }
        const prodMap = new Map<number, ProductAdminVo>(
          (allProducts?.productList ?? []).map((p) => [p.id, p]),
        );
        const source = invData.length ? invData : [];
        if (source.length === 0) {
          /* 優先用管理端商品清單（僅 active） */
          const activeProds = (allProducts?.productList ?? []).filter(
            (p) => p.active,
          );
          if (activeProds.length > 0) {
            this.products.set(
              activeProds.map((p) => ({
                id: p.id,
                name: p.name,
                eng: p.name,
                price: 0,
                emoji: '',
                bg: 'linear-gradient(135deg,#1e1a14,#3a2e20)',
                stock: 0,
                category: p.category || categoryMap.get(p.categoryId ?? 0) || menuCatMap.get(p.id) || '',
                style: p.style || styleMap.get(p.styleId ?? 0) || menuStyleMap.get(p.id) || '',
              })),
            );
            return;
          }
          /* 管理端資料也取不到（Staff 無權限）→ 改用前台菜單 API */
          if (menu?.data?.length) {
            this.products.set(
              menu.data.map((p) => ({
                id: p.productId,
                name: p.name,
                eng: p.name,
                price: p.basePrice,
                emoji: '',
                bg: 'linear-gradient(135deg,#1e1a14,#3a2e20)',
                stock: p.stockQuantity,
                category: p.category ?? '',
                style: p.style ?? '',
                badge: p.stockQuantity <= 5 ? ('low' as const) : undefined,
              })),
            );
          }
          return;
        }
        this.products.set(
          source
            .filter((inv) => {
              const prod = prodMap.get(inv.productId);
              return prod?.active ?? inv.active;
            })
            .map((inv) => {
              const prod = prodMap.get(inv.productId);
              const category =
                inv.category ||
                prod?.category ||
                categoryMap.get(prod?.categoryId ?? 0) ||
                menuCatMap.get(inv.productId) ||
                '';
              const style =
                inv.style ||
                prod?.style ||
                styleMap.get(prod?.styleId ?? 0) ||
                menuStyleMap.get(inv.productId) ||
                '';
              return {
                id: inv.productId,
                name: inv.productName,
                eng: inv.productName,
                price: inv.basePrice,
                emoji: '',
                bg: 'linear-gradient(135deg,#1e1a14,#3a2e20)',
                stock: inv.stockQuantity,
                category,
                style,
                badge: inv.stockQuantity <= 5 ? ('low' as const) : undefined,
              };
            }),
        );
      },
      error: () => {
        console.warn('[POS] 商品載入失敗，改用前台菜單 API');
        this._loadProductsFromMenu(globalAreaId);
      },
    });
  }

  private _loadProductsFromMenu(globalAreaId: number): void {
    this.apiService.getActiveProducts(globalAreaId).subscribe({
      next: (menuRes) => {
        if (menuRes?.data?.length) {
          this.products.set(
            menuRes.data.map((p) => ({
              id: p.productId,
              name: p.name,
              eng: p.name,
              price: p.basePrice,
              emoji: '',
              bg: 'linear-gradient(135deg,#1e1a14,#3a2e20)',
              stock: p.stockQuantity,
              category: p.category ?? '',
              style: p.style ?? '',
              badge: p.stockQuantity <= 5 ? ('low' as const) : undefined,
            })),
          );
        }
      },
      error: () => console.warn('[POS] 菜單 API 也失敗'),
    });
  }

  /* 結帳後重新拉 POS 選單商品庫存，覆蓋本地暫存的扣減值 */
  private _reloadProductStock(_globalAreaId: number): void {
    this.loadStockList();
  }

  /* ── 庫存調整 ─────────────────────────────────────── */
  startAdjustStock(productId: number): void {
    const p = this.posStockList().find((x) => x.productId === productId);
    if (!p) return;
    this.adjustingStockId.set(productId);
    this.adjustStockAmount.set(p.stockQuantity);
  }

  cancelAdjustStock(): void {
    this.adjustingStockId.set(null);
  }

  onAdjustInput(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && val >= 0) this.adjustStockAmount.set(val);
  }

  stepStock(delta: number): void {
    this.adjustStockAmount.update((v) => Math.max(0, v + delta));
  }

  confirmAdjustStock(): void {
    const id = this.adjustingStockId();
    const amt = this.adjustStockAmount();
    if (id === null) return;
    this.posStockList.update((list) =>
      list.map((p) => (p.productId === id ? { ...p, stockQuantity: amt } : p)),
    );
    this.adjustingStockId.set(null);
    this.adjustStockSavedId.set(id);
    setTimeout(() => this.adjustStockSavedId.set(null), 1800);
    const globalAreaId = this.authService.currentStaff?.globalAreaId ?? 19;
    const existing = this.posStockList().find((p) => p.productId === id);
    if (existing) {
      this.apiService
        .deductInventoryBatch([
          {
            productId: id,
            globalAreaId,
            stockQuantity: amt,
            basePrice: existing.basePrice,
            costPrice: existing.costPrice,
            maxOrderQuantity: existing.maxOrderQuantity,
            active: existing.active,
          },
        ])
        .subscribe({
          error: () => console.warn('[POS] 庫存同步後端失敗，前端已更新'),
        });
    }
  }

  /* ── 員工帳號：新增 Modal ────────────────────────── */
  openAddStaff(): void {
    this.newStaffName.set('');
    this.newStaffAccount.set('');
    this.newStaffPassword.set('');
    this.showAddStaffModal.set(true);
  }

  cancelAddStaff(): void {
    this.showAddStaffModal.set(false);
  }

  openEditStaff(id: number): void {
    const staff = this.staffAccounts().find((s) => s.id === id);
    if (!staff) return;
    this.editStaffId.set(id);
    this.editStaffDraft = {
      name: staff.name,
      password: '',
      backendRole: staff.backendRole,
    };
    this.showEditStaffModal.set(true);
  }

  get editStaffIsMA(): boolean {
    const id = this.editStaffId();
    if (id === null) return false;
    return (
      this.staffAccounts().find((s) => s.id === id)?.backendRole ===
      'MANAGER_AGENT'
    );
  }

  cancelEditStaff(): void {
    this.showEditStaffModal.set(false);
    this.editStaffId.set(null);
  }

  saveEditStaff(): void {
    const id = this.editStaffId();
    if (id === null) return;
    const { name, password, backendRole } = this.editStaffDraft;
    if (!name.trim()) {
      this.posShowToast('⚠️ 姓名為必填');
      return;
    }

    // 若有填新密碼，呼叫修改密碼 API
    if (password.trim()) {
      this.apiService
        .changeStaffPassword(id)
        .subscribe({
          next: () => this.posShowToast('✅ 密碼已重設為預設值'),
          error: () => this.posShowToast('⚠️ 密碼修改失敗'),
        });
    }

    // 若角色改為副店長，呼叫升遷 API（使用 /toggle 端點）
    const current = this.staffAccounts().find((s) => s.id === id);
    if (current?.backendRole === 'STAFF' && backendRole === 'MANAGER_AGENT') {
      this.apiService.toggleStaff(id).subscribe({
        next: () => {
          this.staffAccounts.update((list) =>
            list.map((s) =>
              s.id === id
                ? {
                    ...s,
                    name: name.trim(),
                    backendRole: 'MANAGER_AGENT',
                    account: s.account.replace(/^ST/, 'MA'),
                  }
                : s,
            ),
          );
          this.posShowToast('✅ 已升遷為副店長');
        },
        error: () => this.posShowToast('⚠️ 升遷失敗'),
      });
    } else {
      // 只更新本地姓名（後端目前無單獨更新姓名的端點）
      this.staffAccounts.update((list) =>
        list.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)),
      );
      this.posShowToast('✅ 已更新');
    }

    this.showEditStaffModal.set(false);
    this.editStaffId.set(null);
  }

  confirmAddStaff(): void {
    const name = this.newStaffName().trim();
    if (!name) return;

    const globalAreaId = this.authService.currentStaff?.globalAreaId ?? 19;
    this.apiService
      .createStaff({
        name,
        role: 'STAFF',
        globalAreaId,
      })
      .subscribe({
        next: () => {
          this.showAddStaffModal.set(false);
          this.posShowToast('✅ 員工帳號已新增，帳號由系統自動產生');
          // 重新從後端拉員工清單
          this.apiService.getAllStaff().subscribe({
            next: (staffRes) => {
              if (staffRes?.staffList?.length) {
                this.staffAccounts.set(
                  staffRes.staffList
                    .filter(
                      (s) => s.role !== 'ADMIN' && s.role !== 'REGION_MANAGER',
                    )
                    .map((s) => ({
                      id: s.id,
                      name: s.name,
                      account: s.account,
                      backendRole: s.role,
                      isActive: s.status ?? true,
                      joinedAt: s.hireAt?.slice(0, 10) ?? '',
                    })),
                );
              }
            },
            error: () => {},
          });
        },
        error: () => this.posShowToast('⚠️ 新增失敗，請確認後端連線'),
      });
  }

  /* ── 員工帳號：停/復權 ────────────────────────────── */
  toggleStaff(id: number): void {
    const target = this.staffAccounts().find((s) => s.id === id);
    if (!target) return;
    const newStatus = !target.isActive;
    this.staffAccounts.update((list) =>
      list.map((s) => (s.id === id ? { ...s, isActive: newStatus } : s)),
    );
    this.apiService.updateStaffStatus(id, { newStatus: newStatus }).subscribe({
      next: () =>
        this.posShowToast(newStatus ? `✅ 帳號已復權` : `🔒 帳號已停權`),
      error: () => {
        this.staffAccounts.update((list) =>
          list.map((s) => (s.id === id ? { ...s, isActive: !newStatus } : s)),
        );
        this.posShowToast('⚠️ 更新失敗，請確認後端連線');
      },
    });
  }

  /* ── 活動管理方法 ─────────────────────────────────── */
  today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  posShowToast(msg: string): void {
    this.posToastMsg.set(msg);
    clearTimeout(this.posToastTimer);
    this.posToastTimer = setTimeout(() => this.posToastMsg.set(''), 3000);
  }

  deletePromo(id: number): void {
    const promo = this.posPromos().find((p) => p.id === id);
    if (!promo) return;
    if (!confirm(`確定刪除活動「${promo.title}」？此操作無法復原。`)) return;
    this.posPromos.update((list) => list.filter((p) => p.id !== id));
    this.posShowToast(`活動「${promo.title}」已刪除`);
  }

  openAddPromo(): void {
    this.posPromoDraft = {
      name: '',
      description: '',
      startTime: '',
      endTime: '',
      badgeColor: '#c49756',
      minAmount: null,
      image: '',
      currency: 'NT$',
    };
    this.showPosPromoPanel.set(true);
  }

  closePromoPanel(): void {
    this.showPosPromoPanel.set(false);
  }

  onPromoBadgeColorPick(color: string): void {
    this.posPromoDraft.badgeColor = color;
  }

  onPromoImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.posPromoDraft.image = e.target?.result as string;
    };
    reader.readAsDataURL(input.files[0]);
  }

  savePromo(): void {
    if (!this.posPromoDraft.name.trim()) {
      this.posShowToast('請輸入活動名稱');
      return;
    }
    if (!this.posPromoDraft.startTime || !this.posPromoDraft.endTime) {
      this.posShowToast('請填寫活動開始與結束日期');
      return;
    }
    const saved = { ...this.posPromoDraft };
    const ids = this.posPromos().map((p) => p.id);
    const newId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
    this.posPromos.update((list) => [
      ...list,
      {
        id: newId,
        title: saved.name.trim(),
        isActive: true,
        color: saved.badgeColor || '#c49756',
        ended: false,
        rawStartTime: saved.startTime,
        rawEndTime: saved.endTime,
        type: 'promotion' as const,
        description: saved.description,
        image: saved.image,
        badgeColor: saved.badgeColor,
        minAmount: saved.minAmount ?? undefined,
      },
    ]);
    this.closePromoPanel();
    this.posShowToast(`活動「${saved.name.trim()}」已新增`);
  }

  /* ── 售價調整 ────────────────────────────────────── */
  adjustingPriceId = signal<number | null>(null);
  adjustPriceDraft = signal<number>(0);
  adjustPriceSavedId = signal<number | null>(null);

  startAdjustPrice(productId: number): void {
    const p = this.posStockList().find((x) => x.productId === productId);
    if (!p) return;
    this.adjustingPriceId.set(productId);
    this.adjustPriceDraft.set(p.basePrice);
  }

  cancelAdjustPrice(): void {
    this.adjustingPriceId.set(null);
  }

  onPriceInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val) && val >= 0) this.adjustPriceDraft.set(val);
  }

  confirmAdjustPrice(): void {
    const id = this.adjustingPriceId();
    const price = this.adjustPriceDraft();
    if (id === null) return;
    const p = this.posStockList().find((x) => x.productId === id);
    if (!p) return;
    if (price <= 0) {
      this.posShowToast('⚠️ 售價必須大於 0');
      return;
    }
    const globalAreaId = this.authService.currentStaff?.globalAreaId ?? 19;
    this.posStockList.update((list) =>
      list.map((x) => (x.productId === id ? { ...x, basePrice: price } : x)),
    );
    this.adjustingPriceId.set(null);
    this.adjustPriceSavedId.set(id);
    setTimeout(() => this.adjustPriceSavedId.set(null), 1800);
    this.apiService
      .updateBranchInventory({
        productId: id,
        globalAreaId,
        stockQuantity: p.stockQuantity,
        basePrice: price,
        costPrice: p.costPrice,
        maxOrderQuantity: p.maxOrderQuantity,
        active: p.active,
      })
      .subscribe({
        error: () => console.warn('[POS] 售價同步後端失敗，前端已更新'),
      });
  }

  /* ── 最大購買量調整（調整 → +10/-10 → 確認）──────── */
  adjustingMaxQtyId = signal<number | null>(null);
  adjustMaxQtyDraft = signal<number>(1);
  adjustMaxQtySavedId = signal<number | null>(null);

  startAdjustMaxQty(productId: number): void {
    const p = this.posStockList().find((x) => x.productId === productId);
    if (!p) return;
    this.adjustingMaxQtyId.set(productId);
    this.adjustMaxQtyDraft.set(p.maxOrderQuantity);
  }

  cancelAdjustMaxQty(): void {
    this.adjustingMaxQtyId.set(null);
  }

  onMaxQtyInput(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && val >= 1) this.adjustMaxQtyDraft.set(val);
  }

  stepMaxQty(delta: number): void {
    this.adjustMaxQtyDraft.update((v) => Math.max(1, v + delta));
  }

  confirmAdjustMaxQty(): void {
    const id = this.adjustingMaxQtyId();
    const newQty = this.adjustMaxQtyDraft();
    if (id === null) return;
    const p = this.posStockList().find((x) => x.productId === id);
    if (!p) return;
    const globalAreaId = this.authService.currentStaff?.globalAreaId ?? 19;
    this.posStockList.update((list) =>
      list.map((x) =>
        x.productId === id ? { ...x, maxOrderQuantity: newQty } : x,
      ),
    );
    this.adjustingMaxQtyId.set(null);
    this.adjustMaxQtySavedId.set(id);
    setTimeout(() => this.adjustMaxQtySavedId.set(null), 1800);
    this.apiService
      .updateBranchInventory({
        productId: id,
        globalAreaId,
        stockQuantity: p.stockQuantity,
        basePrice: p.basePrice,
        costPrice: p.costPrice,
        maxOrderQuantity: newQty,
        active: p.active,
      })
      .subscribe({
        error: () => console.warn('[POS] 最大購買量同步後端失敗，前端已更新'),
      });
  }

  /* ── 報電話號碼查詢取餐訂單 ─────────────────────── */
  searchByPhone(): void {
    const rawPhone = this.phoneQuery().trim().replace(/-/g, '');
    if (!rawPhone) {
      this.phoneSearchError.set('請輸入手機號碼');
      return;
    }
    const phone = /^09\d{8}$/.test(rawPhone)
      ? '+886' + rawPhone.slice(1)
      : rawPhone;
    this.phoneSearchLoading.set(true);
    this.phoneSearchDone.set(false);
    this.phoneSearchError.set('');
    this.phoneSearchResults.set([]);
    this.apiService.getOrderByPhone(phone).subscribe({
      next: (res) => {
        this.phoneSearchLoading.set(false);
        this.phoneSearchDone.set(true);
        if (res?.code === 200 && res.getOrderVoList?.length) {
          this.phoneSearchResults.set(res.getOrderVoList);
        } else if (res?.code === 403) {
          this.phoneSearchError.set('連線已逾時，請重新整理頁面並重新登入');
          this.phoneSearchResults.set([]);
        } else {
          this.phoneSearchResults.set([]);
        }
      },
      error: () => {
        this.phoneSearchLoading.set(false);
        this.phoneSearchDone.set(true);
        this.phoneSearchError.set('查詢失敗，請確認後端連線');
      },
    });
  }

  clearPhoneSearch(): void {
    this.phoneQuery.set('');
    this.phoneSearchResults.set([]);
    this.phoneSearchDone.set(false);
    this.phoneSearchError.set('');
  }

  /* 判斷訂單是否屬於本分店 */
  isSameBranch(order: import('../shared/api.service').GetOrdersVo): boolean {
    const staffAreaId = this.authService.currentStaff?.globalAreaId;
    return staffAreaId == null || order.globalAreaId === staffAreaId;
  }

  /* 分店長切換至後台管理 */
  goToRmDashboard(): void {
    this.router.navigate(['/rm-dashboard']);
  }

  /* 登出 */
  logout(): void {
    this.authService.logout();
    this.router.navigate(['/staff-login']);
  }

  /* ── 員工自改密碼 ────────────────────────────────── */
  changePwOpen = signal(false);
  changePwOld = signal('');
  changePwNew = signal('');
  changePwConfirm = signal('');
  changePwError = signal('');


  /* 密碼顯示切換 */
  showAddStaffPwd = signal(false);
  showEditStaffPwd = signal(false);
  showChangePwOld = signal(false);
  showChangePwNew = signal(false);
  showChangePwConf = signal(false);

  openChangePw(): void {
    this.changePwOld.set('');
    this.changePwNew.set('');
    this.changePwConfirm.set('');
    this.changePwError.set('');
    this.changePwOpen.set(true);
  }

  submitChangePw(): void {
    if (this.changePwNew() !== this.changePwConfirm()) {
      this.changePwError.set('兩次新密碼不一致');
      return;
    }
    if (this.changePwNew().length < 6) {
      this.changePwError.set('新密碼至少 6 位');
      return;
    }
    const staff = this.authService.currentStaff;
    if (!staff) return;
    const req: SelfChangePasswordReq = {
      account: staff.account,
      oldPassword: this.changePwOld(),
      newPassword: this.changePwNew(),
    };
    this.apiService.selfChangePassword(req).subscribe({
      next: () => {
        this.changePwOpen.set(false);
        this.posShowToast('✅ 密碼修改成功');
      },
      error: () => this.changePwError.set('舊密碼錯誤或伺服器異常'),
    });
  }

}
