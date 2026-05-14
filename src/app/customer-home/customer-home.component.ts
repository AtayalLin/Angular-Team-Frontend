/*
 * =====================================================
 * 檔案名稱：customer-home.component.ts
 * 位置說明：src/app/customer-home/customer-home.component.ts
 * 用途說明：客戶端登入後的主頁框架（Shell）
 * 功能說明：
 *   - 底部導覽列（主頁 / 菜單 / 結帳 / 追蹤 / 訂單管理）
 *   - 登入保護守衛（未登入者自動跳回登入頁）
 *   - 購物車狀態管理（供菜單、結帳頁共用）
 *   - 頁籤切換狀態管理
 *   - 下單後透過 OrderService 即時推送至 POS 看板
 * =====================================================
 */

import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  effect,
} from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { QRCodeComponent } from 'angularx-qrcode';
// import { RouterLink } from '@angular/router';
import { AuthService } from '../shared/auth.service';
import { LoadingService } from '../shared/loading.service';
import { OrderService, OrderStatus } from '../shared/order.service';
import { firstValueFrom, forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  ApiService,
  GetOrdersVo,
  GetOrdersDetailVo,
  CartSyncReq,
  CreateOrdersReq,
  CartRemoveReq,
  CartClearReq,
  OrderCartDetailItem,
  PromotionDetailVo,
  GiftItem,
} from '../shared/api.service';
import { DEMO_BASE_URL } from '../shared/demo.config';
import {
  BranchService,
  CountryCode,
  CountryConfig,
} from '../shared/branch.service';

/* ── 購物車品項型別 ─────────────────────────────────── */
export interface CartItem {
  id: number;
  name: string;
  nameEn: string;
  nameJP?: string;
  nameKR?: string;
  price: number;
  quantity: number;
  image: string;
  category: string;
  note?: string;
}

/* ── 菜單品項型別 ─────────────────────────────────────── */
export interface MenuItem {
  id: number;
  name: string;
  nameEn: string;
  nameJP?: string;
  nameKR?: string;
  price: number;
  image: string;
  category: string;
  categoryEn: string;
  style?: string;
  description: string;
  descriptionJP?: string;
  descriptionKR?: string;
  isHot?: boolean;
  isNew?: boolean;
  stock: number;
}

/* ── 訂單追蹤型別 ─────────────────────────────────────── */
export interface ActiveOrder {
  id: string;
  number: string;
  status: 'cooking' | 'ready' | 'done';
  items: string[];
  total: number;
  createdAt: string;
  payMethod: string;
  isCash: boolean;
  estimatedMinutes: number;
}

/* ── 訂單追蹤型別 ─────────────────────────────────────── */
export interface TrackingOrder {
  id: string;
  number: string;
  status: string;
  estimatedMinutes: number;
  items: string[];
  total: number;
  createdAt: string;
  payMethod: string;
  isCash: boolean;
}

/* ── 頁籤型別 ──────────────────────────────────────────── */
export type TabId =
  | 'home'
  | 'menu'
  | 'checkout'
  | 'payment'
  | 'orders'
  | 'promotions';

/* ── 頁籤定義型別 ──────────────────────────────────────── */
interface NavTab {
  id: TabId;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-customer-home',
  standalone: true,
  imports: [CommonModule, QRCodeComponent],
  templateUrl: './customer-home.component.html',
  styleUrls: ['./customer-home.component.scss'],
})
export class CustomerHomeComponent implements OnInit, OnDestroy {
  /* ── 當前頁籤 ───────────────────────────────────────── */
  activeTab = signal<TabId>('home');

  /* ── 首頁輪播 ───────────────────────────────────────── */
  heroSlideIndex = signal(0);
  readonly HERO_SLIDE_COUNT = 3;
  private heroTimer: ReturnType<typeof setInterval> | null = null;
  private heroPaused = false;
  private _removalTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /* ── 促銷橫幅輪播 ────────────────────────────────────── */
  promoBannerIndex = signal(0);
  private promoBannerTimer: ReturnType<typeof setInterval> | null = null;

  prevHeroSlide(): void {
    this.heroSlideIndex.update(
      (i) => (i - 1 + this.HERO_SLIDE_COUNT) % this.HERO_SLIDE_COUNT,
    );
  }

  nextHeroSlide(): void {
    this.heroSlideIndex.update((i) => (i + 1) % this.HERO_SLIDE_COUNT);
  }

  goToHeroSlide(index: number): void {
    this.heroSlideIndex.set(index);
  }

  pauseCarousel(): void {
    this.heroPaused = true;
  }

  resumeCarousel(): void {
    this.heroPaused = false;
  }

  /* ── 購物車 ─────────────────────────────────────────── */
  cartItems = signal<CartItem[]>([]);
  currentCartId = signal<number | null>(null);
  private promoGiftIds = new Map<string, number>(); // 贈品名稱 → promotionsGiftsId
  private promoGiftProductIds = new Map<string, number>(); // 贈品名稱 → productId（菜單品項 ID）
  private promoNameToId = new Map<string, number>(); // 活動顯示名稱 → promotions.id（後端 promotions 主鍵）
  private outOfStockGifts = new Set<string>(); // 庫存為 0 的贈品 productName
  checkoutGifts = signal<GiftItem[]>([]); // 結帳頁可選贈品（由 getAvailableGifts API 即時取得）
  private _giftsSubscription?: Subscription;

  cartCount = computed(() =>
    this.cartItems().reduce((sum, item) => sum + item.quantity, 0),
  );

  cartTotal = computed(() =>
    this.cartItems().reduce((sum, item) => sum + item.price * item.quantity, 0),
  );

  /* ── 訪客判斷 ──────────────────────────────────────── */
  isGuest = computed(() => !!this.authService.currentUser?.isGuest);

  /* ── 身分識別格式化 ────────────────────────────── */
  userRoleLabel = computed(() => {
    const user = this.authService.currentUser;
    if (!user) return '';
    const l = this.branchService.lang();
    if (user.isGuest) return l.guestLabel;
    return l.memberLabel;
  });

  formattedName = computed(() => {
    const user = this.authService.currentUser;
    const l = this.branchService.lang();
    if (!user) return l.notLoggedIn;
    if (user.isGuest && user.phone) {
      return `${l.guestLabel}「${user.phone}」`;
    }
    return user.name || l.noName;
  });

  /* ── 多語翻譯對照表（依中文名稱 key，供 API 回傳後合併用）── */
  private static readonly MENU_I18N: Record<
    string,
    Pick<
      MenuItem,
      'nameEn' | 'nameJP' | 'nameKR' | 'descriptionJP' | 'descriptionKR'
    >
  > = {
      招牌滷肉飯: {
        nameEn: 'Braised Pork Rice',
        nameJP: '魯肉飯（台湾風豚角煮丼）',
        nameKR: '루러우판（대만식 돼지고기 덮밥）',
        descriptionJP:
          '豚バラ肉をじっくり煮込んだ濃厚タレ、半熟煮卵とさっぱりキムチ添え',
        descriptionKR:
          '천천히 조린 삼겹살, 진한 간장 소스, 반숙 달걀과 아삭한 겉절이 곁들임',
      },
      古早味排骨飯: {
        nameEn: 'Pork Chop Rice',
        nameJP: '台湾風ポークカツ丼（懐かし風）',
        nameKR: '전통식 돼지갈비 덮밥',
        descriptionJP: '台湾式の揚げポークチョップ、大根の煮物と白ご飯',
        descriptionKR: '대만식 튀긴 돼지갈비, 무 조림과 흰 쌀밥',
      },
      牛排: {
        nameEn: 'Beef Steak',
        nameJP: 'ビーフステーキ',
        nameKR: '비프 스테이크',
        descriptionJP:
          'オーストラリア産牛肉、炭火焼きで旨みを閉じ込め、季節野菜とソース添え',
        descriptionKR:
          '호주산 소고기, 직화구이로 육즙 봉인, 제철 채소와 소스 곁들임',
      },
      三杯雞: {
        nameEn: 'Three Cup Chicken',
        nameJP: '三杯鶏（台湾風醤油バジル煮）',
        nameKR: '삼배계（대만식 간장 바질 닭요리）',
        descriptionJP: 'ごま油・醤油・紹興酒で炒め煮、バジルの香り豊か',
        descriptionKR: '참기름·간장·쌀술 삼배 조리, 바질 향이 가득',
      },
      蚵仔煎: {
        nameEn: 'Oyster Pancake',
        nameJP: '牡蠣オムレツ（台湾風）',
        nameKR: '대만식 굴전',
        descriptionJP:
          '新鮮な牡蠣を使ったさつまいも粉のパンケーキ、特製甘辛ソースがけ',
        descriptionKR:
          '신선한 굴을 넣은 고구마 전분 전, 특제 매콤달콤 소스 곁들임',
      },
      蚵仔麵線: {
        nameEn: 'Oyster Vermicelli',
        nameJP: '牡蠣そうめん（台湾風とろみ麺）',
        nameKR: '굴 국수（대만식 걸쭉한 면）',
        descriptionJP:
          '新鮮な牡蠣と細麺のスープ、甘辛ソースで味付けした夜市の定番',
        descriptionKR:
          '신선한 굴과 가는 국수의 조화, 매콤달콤 소스의 야시장 명물',
      },
      阿三陽春麵: {
        nameEn: 'Traditional Noodle',
        nameJP: 'アサン陽春麺（台湾式あっさり麺）',
        nameKR: '아산 양춘면（담백한 대만식 국수）',
        descriptionJP: '昔ながら製法のクリアスープ、手打ち麺のもちもち食感',
        descriptionKR: '전통 방식으로 우린 맑은 육수, 수제 면의 탱글탱글한 식감',
      },
      黑糖珍珠奶茶: {
        nameEn: 'Brown Sugar Boba',
        nameJP: '黒糖タピオカミルクティー',
        nameKR: '흑당 버블 밀크티',
        descriptionJP: '出来たてタピオカ、手作り黒糖タイガーストライプ',
        descriptionKR: '갓 삶은 타피오카, 수제 흑당 호랑이 무늬',
      },
      仙草奶茶: {
        nameEn: 'Grass Jelly Milk Tea',
        nameJP: '仙草ミルクティー',
        nameKR: '선초 밀크티',
        descriptionJP:
          '台湾産仙草ゼリー入り、濃厚ミルクティーとの絶妙な組み合わせ',
        descriptionKR: '대만산 선초 젤리, 진한 밀크티와의 절묘한 조합',
      },
    };

  /* ── 菜單品項（API 載入後動態填充；MOCK_MODE 下使用靜態 Demo 資料）── */
  menuItems = signal<MenuItem[]>([
    {
      id: 1,
      name: '招牌滷肉飯',
      ...CustomerHomeComponent.MENU_I18N['招牌滷肉飯'],
      price: 120,
      image: '',
      category: '飯食',
      categoryEn: 'Rice',
      style: '台式經典',
      description: '慢燉豬五花，滷汁濃醇入味，配半熟滷蛋與爽脆泡菜',
      stock: 20,
    },
    {
      id: 2,
      name: '古早味排骨飯',
      ...CustomerHomeComponent.MENU_I18N['古早味排骨飯'],
      price: 145,
      image: '',
      category: '飯食',
      categoryEn: 'Rice',
      style: '台式經典',
      description: '台式醃製炸排骨，滷汁菜頭配白飯',
      stock: 15,
    },
    {
      id: 8,
      name: '牛排',
      ...CustomerHomeComponent.MENU_I18N['牛排'],
      price: 130,
      image: '',
      category: '飯食',
      categoryEn: 'Rice',
      style: '美式熱情',
      description: '精選澳洲牛肉，炭烤鎖汁，附時蔬與醬汁',
      stock: 10,
    },
    {
      id: 9,
      name: '三杯雞',
      ...CustomerHomeComponent.MENU_I18N['三杯雞'],
      price: 150,
      image: '',
      category: '飯食',
      categoryEn: 'Rice',
      style: '台式經典',
      description: '麻油、醬油、米酒三杯燒製，九層塔香氣四溢',
      stock: 15,
    },
    {
      id: 3,
      name: '蚵仔煎',
      ...CustomerHomeComponent.MENU_I18N['蚵仔煎'],
      price: 80,
      image: '',
      category: '小吃',
      categoryEn: 'Snacks',
      style: '台式經典',
      description: '鮮蚵地瓜粉煎餅，淋上特製甜辣醬',
      stock: 18,
    },
    {
      id: 7,
      name: '蚵仔麵線',
      ...CustomerHomeComponent.MENU_I18N['蚵仔麵線'],
      price: 70,
      image: '',
      category: '小吃',
      categoryEn: 'Snacks',
      style: '台式經典',
      description: '鮮蚵燴入麵線，甜辣醬提味，道地夜市風味',
      stock: 20,
    },
    {
      id: 4,
      name: '阿三陽春麵',
      ...CustomerHomeComponent.MENU_I18N['阿三陽春麵'],
      price: 120,
      image: '',
      category: '麵食',
      categoryEn: 'Noodles',
      style: '台式經典',
      description: '古法熬製清湯底，手工製麵條彈牙有嚼勁',
      stock: 15,
    },
    {
      id: 5,
      name: '黑糖珍珠奶茶',
      ...CustomerHomeComponent.MENU_I18N['黑糖珍珠奶茶'],
      price: 75,
      image: '',
      category: '飲品',
      categoryEn: 'Drinks',
      style: '台式經典',
      description: '現煮珍珠，手工黑糖虎紋',
      stock: 50,
    },
    {
      id: 6,
      name: '仙草奶茶',
      ...CustomerHomeComponent.MENU_I18N['仙草奶茶'],
      price: 65,
      image: '',
      category: '飲品',
      categoryEn: 'Drinks',
      style: '台式經典',
      description: '台灣本產仙草凍，搭配濃醇鮮奶茶',
      stock: 30,
    },
  ]);

  /** 從 menuItems 衍生的分類清單（去重，保持插入順序，過濾 null/undefined/空字串） */
  menuCategories = computed<string[]>(() => {
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const item of this.menuItems()) {
      if (item.category && !seen.has(item.category)) {
        seen.add(item.category);
        cats.push(item.category);
      }
    }
    return cats;
  });

  /** 取得指定分類中通過搜尋/篩選的品項 */
  getItemsByCategory(cat: string): MenuItem[] {
    return this.menuItems().filter(
      (item) =>
        item.category === cat &&
        this.isMenuItemShown(item.name, item.category, item.style),
    );
  }

  /** 分類標題文字（含 emoji） */
  getCategoryLabel(cat: string): string {
    if (!cat) return '';
    const cc = this.branchService.country;
    const MAP_TW: Record<string, string> = {
      台式: '🏮 台式料理',
      飯食: '🍱 飯食料理',
      小吃: '🦪 台灣小吃',
      麵食: '🍜 麵食',
      飲品: '🧋 特調飲品',
      甜點: '🍰 甜點',
      湯品: '🍲 湯品料理',
      前菜: '🥗 前菜',
      熱炒: '🔥 熱炒料理',
    };
    const MAP_JP: Record<string, string> = {
      台式: '🏮 台湾スタイル',
      飯食: '🍱 ご飯料理',
      小吃: '🦪 台湾スナック',
      麵食: '🍜 麺料理',
      飲品: '🧋 ドリンク',
      甜點: '🍰 デザート',
      湯品: '🍲 スープ料理',
      前菜: '🥗 前菜',
      熱炒: '🔥 炒め物',
    };
    const MAP_KR: Record<string, string> = {
      台式: '🏮 대만식',
      飯食: '🍱 밥 요리',
      小吃: '🦪 대만 간식',
      麵食: '🍜 면 요리',
      飲品: '🧋 음료',
      甜點: '🍰 디저트',
      湯品: '🍲 국물요리',
      前菜: '🥗 전채요리',
      熱炒: '🔥 볶음요리',
    };
    if (cc === 'JP') return MAP_JP[cat] ?? `🍽 ${cat}`;
    if (cc === 'KR') return MAP_KR[cat] ?? `🍽 ${cat}`;
    return MAP_TW[cat] ?? `🍽 ${cat}`;
  }

  /** CSS 背景圖 class（MOCK 模式下依名稱對應；真實模式下由 image 欄位帶入） */
  getMenuImageClass(item: MenuItem): string {
    if (item.image) return '';
    const MAP: Record<string, string> = {
      招牌滷肉飯: 'mi-braised-pork',
      古早味排骨飯: 'mi-pork-chop',
      蚵仔煎: 'mi-oyster-pancake',
      阿三陽春麵: 'mi-beef',
      黑糖珍珠奶茶: 'mi-bbt',
      仙草奶茶: 'mi-grass-jelly',
      蚵仔麵線: 'mi-oyster-noodle',
      牛排: 'mi-steak',
      三杯雞: 'mi-3cup-chicken',
    };
    return MAP[item.name] ?? '';
  }

  /* ── 菜單：分類定義（對應 category.json，共 9 個）─────────── */
  readonly CATEGORY_DEFS: { key: string; emoji: string }[] = [
    { key: '台式', emoji: '🏮' },
    { key: '飯食', emoji: '🍱' },
    { key: '小吃', emoji: '🦪' },
    { key: '麵食', emoji: '🍜' },
    { key: '飲品', emoji: '🧋' },
    { key: '甜點', emoji: '🍰' },
    { key: '湯品', emoji: '🍲' },
    { key: '前菜', emoji: '🥗' },
    { key: '熱炒', emoji: '🔥' },
  ];

  readonly STYLE_DEFS: { key: string; emoji: string }[] = [
    { key: '台式經典', emoji: '🏮' },
    { key: '日式簡約', emoji: '🌸' },
    { key: '韓式風情', emoji: '🌙' },
    { key: '美式熱情', emoji: '🗽' },
    { key: '義式浪漫', emoji: '🌹' },
  ];

  /* ── 菜單：分類篩選 & 搜尋 ────────────────────────── */
  activeMenuCategory = signal<string>('all');
  activeMenuStyle = signal<string>('all');
  menuSearchQuery = signal<string>('');

  /** 動態風格清單（去重，保持插入順序） */
  menuStyles = computed<string[]>(() => {
    const seen = new Set<string>();
    const styles: string[] = [];
    for (const item of this.menuItems()) {
      if (item.style && !seen.has(item.style)) {
        seen.add(item.style);
        styles.push(item.style);
      }
    }
    return styles;
  });

  /** 只顯示有商品的分類 tag（依 CATEGORY_DEFS 順序，過濾無商品分類） */
  visibleCategoryDefs = computed(() => {
    const cats = new Set(this.menuItems().map((item) => item.category));
    return this.CATEGORY_DEFS.filter((def) => cats.has(def.key));
  });

  /** 只顯示有商品的風格 tag（依 STYLE_DEFS 順序，過濾無商品風格） */
  visibleStyleDefs = computed(() => {
    const styles = new Set(
      this.menuItems().map((item) => item.style).filter(Boolean),
    );
    return this.STYLE_DEFS.filter((def) => styles.has(def.key));
  });

  /** 主廚推薦餐點（對應後端真實產品名稱） */
  readonly CHEF_PICKS = ['冠軍紅燒牛肉麵', '府城現炸蝦捲', '五更腸旺旺鍋'];

  setMenuCategory(cat: string): void {
    this.activeMenuCategory.set(cat);
    document.querySelector('.ch-main')?.scrollTo({ top: 0 });
  }

  setMenuStyle(sty: string): void {
    this.activeMenuStyle.set(sty);
    document.querySelector('.ch-main')?.scrollTo({ top: 0 });
  }

  scrollBar(id: string, dir: 'left' | 'right'): void {
    const el = document.getElementById(id);
    if (el) el.scrollBy({ left: dir === 'right' ? 180 : -180, behavior: 'smooth' });
  }

  /** 從首頁主廚推薦卡片點入：切換至菜單頁並套用主廚推薦篩選 */
  goToChefMenu(): void {
    this.activeMenuCategory.set('chef');
    this.setTab('menu');
  }

  onMenuSearch(event: Event): void {
    this.menuSearchQuery.set((event.target as HTMLInputElement).value);
  }

  /** 回傳該品項是否應顯示（分類 + 風格 + 名稱模糊搜尋） */
  isMenuItemShown(name: string, category: string, style?: string): boolean {
    const cat = this.activeMenuCategory();
    const sty = this.activeMenuStyle();
    const q = this.menuSearchQuery().trim().toLowerCase();
    const catMatch =
      cat === 'all' ||
      (cat === 'chef' ? this.CHEF_PICKS.includes(name) : cat === category);
    const styMatch = sty === 'all' || style === sty;
    const nameMatch = q === '' || name.toLowerCase().includes(q);
    return catMatch && styMatch && nameMatch;
  }

  /** 主廚推薦篩選下的所有品項（依 CHEF_PICKS 順序） */
  chefPickItems = computed(() => {
    const q = this.menuSearchQuery().trim().toLowerCase();
    const sty = this.activeMenuStyle();
    return this.CHEF_PICKS.map((name) =>
      this.menuItems().find((i) => i.name === name),
    ).filter(
      (i): i is NonNullable<typeof i> =>
        !!i &&
        (q === '' || i.name.toLowerCase().includes(q)) &&
        (sty === 'all' || i.style === sty),
    );
  });

  /** 回傳整個分類區塊是否應顯示（只要有任一品項符合篩選即顯示） */
  isSectionShown(
    sectionItems: Array<{ name: string; category: string; style?: string }>,
  ): boolean {
    return sectionItems.some((item) =>
      this.isMenuItemShown(item.name, item.category, item.style),
    );
  }

  /** 目前篩選條件下是否有任何餐點可顯示 */
  hasFilteredResults = computed(() =>
    this.menuItems().some((item) =>
      this.isMenuItemShown(item.name, item.category, item.style),
    ),
  );

  resetFilters(): void {
    this.activeMenuCategory.set('all');
    this.activeMenuStyle.set('all');
    this.menuSearchQuery.set('');
  }

  /* ── 側邊欄：個人資料抽屜狀態 ────────────────────── */
  isProfileExpanded = signal(false);
  isEditingProfile = signal(false);

  /* ── 手機版：頂部用戶選單 ─────────────────────────── */
  showMobileMenu = signal(false);
  toggleMobileMenu(): void {
    this.showMobileMenu.update((v) => !v);
  }

  showPassword = signal(false);
  showConfirmPassword = signal(false);
  showOldPassword = signal(false);

  /* 修改密碼表單欄位 */
  editOldPwd = signal('');
  editNewPwd = signal('');
  editConfirmPwd = signal('');
  profileSaveMsg = signal<{ ok: boolean; text: string } | null>(null);

  /* ── 結帳：付款方式選擇 ────────────────────────────── */
  paymentMethod = signal<'ecpay' | 'linepay' | 'cash'>('cash');

  /* ── 訂單備註（暫停使用，以電話號碼欄取代）────────────── */
  orderNote = signal('');

  /* ── 電話號碼（結帳用）─────────────────────────────────
   * 會員：ngOnInit 自動填入 currentUser.phone
   * 訪客：空白，為必填欄位（提交前需驗證）
   * ────────────────────────────────────────────────── */
  phoneNumber = signal('');

  /** 訪客時電話為必填，且必須為 10 位數字；會員時同樣驗證 */
  isPhoneValid = computed(() => /^\d{10}$/.test(this.phoneNumber().trim()));

  /** +886XXXXXXXXX → 0XXXXXXXXX（台灣），其他國碼原樣返回 */
  phoneToLocal(phone: string | undefined | null): string {
    if (!phone) return '';
    if (phone.startsWith('+886')) return '0' + phone.slice(4);
    return phone;
  }

  /** 0XXXXXXXXX → +886XXXXXXXXX（台灣），已是國際格式則原樣返回 */
  private phoneToIntl(phone: string): string {
    if (!phone) return '';
    if (phone.startsWith('0') && /^\d{10}$/.test(phone))
      return '+886' + phone.slice(1);
    if (phone.startsWith('+')) return phone;
    return phone;
  }

  /* ── 待付款訂單（確認建立訂單後存入，付款時使用）── */
  pendingOrderId = signal<string | null>(null);
  pendingOrderDateId = signal<string>('');
  backendConfirmedTotal = signal<number | null>(null);

  /* ── LINE Pay QR Code 付款 Modal ── */
  linePayQrUrl = signal<string | null>(null);
  linePayPollOrderId = signal<string | null>(null);
  linePayPollOrderDateId = signal<string>('');
  /** 付款頁顯示的總計：優先使用後端確認值，fallback 前端計算值 */
  confirmedTotal = computed(
    () => this.backendConfirmedTotal() ?? this.discountedTotal(),
  );

  checkoutToastVisible = false;
  checkoutToastMessage = '';
  private checkoutToastTimer: any = null;

  showCheckoutToast(message: string): void {
    this.checkoutToastMessage = message;
    this.checkoutToastVisible = true;
    if (this.checkoutToastTimer) clearTimeout(this.checkoutToastTimer);
    this.checkoutToastTimer = setTimeout(() => {
      this.checkoutToastVisible = false;
    }, 3000);
  }
  /* ── 信用卡表單 ─────────────────────────────────────────
   * Demo 假卡：4532 1234 5678 9012 / 12/28 / CVV:123
   * ─────────────────────────────────────────────────── */
  cardNumber = signal('');
  cardExpiry = signal('');
  cardCvv = signal('');
  cardHolder = signal('');
  cardFlipped = signal(false); /* true = 顯示卡背面（CVV 輸入中） */

  /** 四欄均完整才視為有效 */
  isCreditCardValid = computed(() => {
    const num = this.cardNumber().replace(/\s/g, '');
    return (
      num.length === 16 &&
      /^\d{2}\/\d{2}$/.test(this.cardExpiry()) &&
      this.cardCvv().replace(/\D/g, '').length >= 3 &&
      this.cardHolder().trim().length > 0
    );
  });

  /** 格式化卡號：每 4 碼加空格 */
  onCardNumberInput(val: string): void {
    const clean = val.replace(/\D/g, '').slice(0, 16);
    this.cardNumber.set(clean.match(/.{1,4}/g)?.join(' ') ?? clean);
  }

  /** 格式化到期日：第 3 碼前自動插入斜線 */
  onCardExpiryInput(val: string): void {
    const clean = val.replace(/\D/g, '').slice(0, 4);
    this.cardExpiry.set(
      clean.length >= 3 ? clean.slice(0, 2) + '/' + clean.slice(2) : clean,
    );
  }

  onCardCvvFocus(): void {
    this.cardFlipped.set(true);
  }
  onCardCvvBlur(): void {
    this.cardFlipped.set(false);
  }
  onCvvInput(value: string): void {
    this.cardCvv.set(value.replace(/\D/g, '').slice(0, 4));
  }

  /* ── 行動支付 QR Modal ──────────────────────────────── */
  showMobilePayModal = signal(false);
  mobilePayCompleted = signal(false);
  private mobilePayTimer: ReturnType<typeof setTimeout> | null = null;

  openMobilePayModal(): void {
    this.showMobilePayModal.set(true);
    this.mobilePayCompleted.set(false);
  }

  /** 使用者在 Modal 按下「確認付款」→ 顯示成功動畫 → 自動送出訂單 */
  completeMobilePayment(): void {
    this.mobilePayCompleted.set(true);
    this.mobilePayTimer = setTimeout(() => {
      this.showMobilePayModal.set(false);
      this._doPlaceOrderAsync()
        .catch(console.error)
        .finally(() => this.isPlacingOrder.set(false));
    }, 2200);
  }

  closeMobilePayModal(): void {
    this.showMobilePayModal.set(false);
    this.mobilePayCompleted.set(false);
    if (this.mobilePayTimer) {
      clearTimeout(this.mobilePayTimer);
      this.mobilePayTimer = null;
    }
  }

  /* ── 下單中狀態（true 時按鈕顯示 spinner，防止重複送出） */
  isPlacingOrder = signal(false);

  setPaymentMethod(method: 'ecpay' | 'linepay' | 'cash'): void {
    this.paymentMethod.set(method);
  }

  toggleProfile(): void {
    if (this.isGuest()) return;
    this.isProfileExpanded.update((v) => !v);
    if (!this.isProfileExpanded()) {
      this.isEditingProfile.set(false);
      this.showPassword.set(false);
      this.showConfirmPassword.set(false);
    }
  }

  toggleEditProfile(): void {
    this.isEditingProfile.update((v) => !v);
    if (!this.isEditingProfile()) {
      this.showPassword.set(false);
      this.showConfirmPassword.set(false);
      this.showOldPassword.set(false);
      this.editOldPwd.set('');
      this.editNewPwd.set('');
      this.editConfirmPwd.set('');
      this.profileSaveMsg.set(null);
    }
  }

  saveProfile(): void {
    const oldPwd = this.editOldPwd().trim();
    const newPwd = this.editNewPwd().trim();
    const confirmPwd = this.editConfirmPwd().trim();

    if (!oldPwd || !newPwd || !confirmPwd) {
      this.profileSaveMsg.set({ ok: false, text: '請填寫所有密碼欄位' });
      return;
    }
    if (newPwd.length < 6) {
      this.profileSaveMsg.set({ ok: false, text: '新密碼至少需要 6 個字元' });
      return;
    }
    if (newPwd !== confirmPwd) {
      this.profileSaveMsg.set({ ok: false, text: '兩次輸入的新密碼不一致' });
      return;
    }

    const id = this.authService.currentUser?.id ?? 0;
    if (!id) {
      this.profileSaveMsg.set({
        ok: false,
        text: '無法取得會員 ID，請重新登入',
      });
      return;
    }
    this.apiService
      .updateMemberPassword({ id, oldPassword: oldPwd, newPassword: newPwd })
      .subscribe({
        next: (res) => {
          if (res?.code === 200) {
            this.profileSaveMsg.set({ ok: true, text: '密碼修改成功！' });
            setTimeout(() => {
              this.isEditingProfile.set(false);
              this.showPassword.set(false);
              this.showConfirmPassword.set(false);
              this.showOldPassword.set(false);
              this.editOldPwd.set('');
              this.editNewPwd.set('');
              this.editConfirmPwd.set('');
              this.profileSaveMsg.set(null);
            }, 1500);
          } else {
            this.profileSaveMsg.set({
              ok: false,
              text: res?.message ?? '修改失敗，請確認舊密碼是否正確',
            });
          }
        },
        error: () => {
          this.profileSaveMsg.set({
            ok: false,
            text: '修改失敗，請確認舊密碼是否正確',
          });
        },
      });
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  toggleOldPasswordVisibility(): void {
    this.showOldPassword.update((v) => !v);
  }

  /* ── 今日優惠橫向滾動 ───────────────────────────────── */
  scrollDeals(el: HTMLElement): void {
    /* 每次滾動一張卡片寬度（240px 卡片 + 12px gap） */
    el.scrollBy({ left: 252, behavior: 'smooth' });
  }

  scrollDealsLeft(el: HTMLElement): void {
    el.scrollBy({ left: -252, behavior: 'smooth' });
  }

  scrollToFeatured(): void {
    this.setTab('home');
    // 等 Angular 渲染完 home tab 後再捲動
    setTimeout(() => {
      const el = document.getElementById('featured-section');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  /* ── 活動優惠選擇（每個活動有獨立贈品清單）─────────── */
  PROMO_ACTIVITIES = [
    {
      name: '滿150小確幸活動',
      nameJP: '新規会員初回注文特典',
      nameKR: '신규 회원 첫 주문 선물',
      minSpend: 150,
      gifts: ['招牌豆漿 × 1', '仙草奶茶 × 1'],
      giftsJP: ['看板豆乳 × 1', '仙草ミルクティー × 1'],
      giftsKR: ['시그니처 두유 × 1', '선초 밀크티 × 1'],
    },
    {
      name: '週末滿額禮',
      nameJP: '週末お買い上げ特典',
      nameKR: '주말 구매 달성 선물',
      minSpend: 300,
      gifts: ['古早味豆腐塊 × 2', '特製泡菜 × 1', '滷蛋 × 2'],
      giftsJP: ['昔ながらの豆腐 × 2', '特製キムチ × 1', '煮卵 × 2'],
      giftsKR: ['전통 두부 × 2', '특제 김치 × 1', '조림 계란 × 2'],
    },
    {
      name: '消費達人大禮包',
      nameJP: 'グルメ達人特大ギフトセット',
      nameKR: '소비 달인 대형 선물 세트',
      minSpend: 500,
      gifts: ['仙草奶茶 × 1 + 滷蛋 × 2', '特製泡菜 × 1 + 古早味豆腐塊 × 2'],
      giftsJP: [
        '仙草ミルクティー × 1 + 煮卵 × 2',
        '特製キムチ × 1 + 昔ながらの豆腐 × 2',
      ],
      giftsKR: [
        '선초 밀크티 × 1 + 조림 계란 × 2',
        '특제 김치 × 1 + 전통 두부 × 2',
      ],
    },
  ];

  /* 活動專區展示資料（含完整圖片、日期、文案） */
  PROMO_DISPLAY = [
    /* ── 全球活動 1：滿150小確幸活動 ── */
    {
      name: '滿150小確幸活動',
      nameJP: '新規会員様限定・初回ご注文特典',
      nameKR: '신규 회원 한정！첫 주문 웰컴 혜택',
      tag: '新會員限定',
      tagType: 'new',
      colorScheme: 'forest',
      image: '/assets/主頁輪播圖1.jpg',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      minSpend: 150,
      gifts: ['招牌豆漿 × 1', '仙草奶茶 × 1'],
      giftsJP: ['看板豆乳 × 1', '仙草ミルクティー × 1'],
      giftsKR: ['시그니처 두유 × 1', '선초 밀크티 × 1'],
      description:
        '首次在懶飽飽下單的新會員，單筆消費滿 $150 即可獲得精選贈品！台灣在地風味與跨國美食任您探索，這份專屬歡迎禮是我們最誠摯的招待。',
      descriptionJP:
        '懶飽飽でのはじめてのご注文で、指定金額以上お買い上げいただいた新規会員様に厳選ギフトを1点プレゼント！台湾グルメからグローバル料理まで、ウェルカムギフトとともに最高のひとときをお楽しみください。',
      descriptionKR:
        '懶飽飽에서 처음 주문하시는 신규 회원님께 지정 금액 이상 구매 시 엄선된 선물을 1개 증정합니다！대만 현지 맛부터 글로벌 퀴진까지, 이 웰컴 선물로 특별한 첫 경험을 시작해 보세요。',
      highlights: [
        '首次消費即享',
        '任選一項贈品',
        '限首筆訂單使用',
        '可與折扣券並用',
      ],
      highlightsJP: [
        '初回ご注文でプレゼント進呈',
        '1つのギフトをお選びいただけます',
        '初回注文のみ適用',
        '割引クーポンとの併用OK',
      ],
      highlightsKR: [
        '첫 주문 시 즉시 증정',
        '선물 1개 선택 가능',
        '첫 번째 주문에만 적용',
        '할인 쿠폰과 중복 가능',
      ],
    },
    /* ── 全球活動 2：週末滿額禮 ── */
    {
      name: '週末滿額禮',
      nameJP: '週末限定！お買い上げプレゼント',
      nameKR: '주말 한정！구매 금액 달성 혜택',
      tag: '期間限定',
      tagType: 'promo',
      colorScheme: 'burgundy',
      image: '/assets/主頁輪播圖2.jpg',
      startDate: '2026-04-05',
      endDate: '2026-05-31',
      minSpend: 300,
      gifts: ['古早味豆腐塊 × 2', '特製泡菜 × 1', '滷蛋 × 2'],
      giftsJP: ['懐かしの豆腐ブロック × 2', '特製キムチ × 1', '煮卵 × 2'],
      giftsKR: ['전통식 두부블럭 × 2', '특제 김치 × 1', '조린 계란 × 2'],
      description:
        '每逢週末，單筆消費滿 $300 即可選一份豐盛贈品！懶飽飽為您準備最道地的台灣小吃作為感謝，讓每個週末都更加美味。',
      descriptionJP:
        '毎週末、指定金額以上お買い上げで豪華プレゼントをひとつお選びいただけます！ご家族との食事にも、自分へのご褒美にも、懶飽飽の本格台湾グルメとともに素敵な週末を。',
      descriptionKR:
        '매주 주말, 지정 금액 이상 구매 시 풍성한 선물 1개를 선택하세요！가족 식사나 나만의 보상에, 懶飽飽가 최고의 대만 음식으로 주말을 더욱 맛있게 만들어 드립니다。',
      highlights: [
        '僅限週六、日適用',
        '消費滿 $300',
        '三款贈品任選一',
        '每筆訂單限贈一次',
      ],
      highlightsJP: [
        '毎週土・日のみ適用',
        '指定金額以上のご購入',
        '3種のギフトからお選び',
        '1注文につき1回限り',
      ],
      highlightsKR: [
        '매주 토·일요일만 적용',
        '지정 금액 이상 구매',
        '3종 선물 중 1개 선택',
        '주문당 1회 한정',
      ],
    },
    /* ── 全球活動 3：消費達人大禮包 ── */
    {
      name: '消費達人大禮包',
      nameJP: 'グルメ達人限定！特大ダブルギフトセット',
      nameKR: '소비 달인 한정！더블 대형 선물 세트',
      tag: '限時豪禮',
      tagType: 'premium',
      colorScheme: 'navy',
      image: '/assets/主頁輪播圖3.jpg',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      minSpend: 500,
      gifts: ['仙草奶茶 × 1 + 滷蛋 × 2', '特製泡菜 × 1 + 古早味豆腐塊 × 2'],
      giftsJP: [
        '仙草ミルクティー × 1 + 煮卵 × 2',
        '特製キムチ × 1 + 懐かしの豆腐 × 2',
      ],
      giftsKR: [
        '선초 밀크티 × 1 + 조린 계란 × 2',
        '특제 김치 × 1 + 전통식 두부 × 2',
      ],
      description:
        '單筆消費滿 $500，立享豪華雙重組合贈品！懶飽飽為美食達人精心準備超值回饋，豐盛組合讓您一次享受多種在地風味，本月限定不容錯過。',
      descriptionJP:
        '指定金額以上お買い上げで、豪華ダブル特典セットをすぐにプレゼント！美食家のための超お得な感謝ギフト、豊富な組み合わせで台湾本場の味を一度に楽しめます。今月限定、お見逃しなく！',
      descriptionKR:
        '지정 금액 이상 구매 시 즉시 더블 선물 세트 증정！미식가를 위한 초대박 감사 선물로, 다양한 현지의 맛을 한 번에 즐기세요. 이달 한정 특별 혜택입니다！',
      highlights: [
        '本月限定活動',
        '消費滿 $500',
        '兩款組合禮任選一',
        '可搭配折扣券使用',
      ],
      highlightsJP: [
        '今月限定キャンペーン',
        '指定金額以上のご購入',
        '2種の組み合わせギフトからお選び',
        '割引クーポンとの併用OK',
      ],
      highlightsKR: [
        '이달 한정 이벤트',
        '지정 금액 이상 구매',
        '2종 콤보 선물 중 1개 선택',
        '할인 쿠폰 중복 사용 가능',
      ],
    },
  ];

  /* 活動專區詳情 Modal */
  promoDetailIndex = signal<number | null>(null);

  openPromoDetail(index: number): void {
    this.promoDetailIndex.set(index);
  }

  closePromoDetail(): void {
    this.promoDetailIndex.set(null);
  }

  get selectedPromoDetail() {
    const i = this.promoDetailIndex();
    return i !== null ? this.PROMO_DISPLAY[i] : null;
  }

  /** 根據目前語言取得品項名稱 */
  getLocalizedName(item: {
    name: string;
    nameJP?: string;
    nameKR?: string;
  }): string {
    const cc = this.branchService.country;
    if (cc === 'JP') return item.nameJP ?? item.name;
    if (cc === 'KR') return item.nameKR ?? item.name;
    return item.name;
  }

  /** 根據目前語言取得品項描述 */
  getLocalizedDesc(item: {
    description: string;
    descriptionJP?: string;
    descriptionKR?: string;
  }): string {
    const cc = this.branchService.country;
    if (cc === 'JP') return item.descriptionJP ?? item.description;
    if (cc === 'KR') return item.descriptionKR ?? item.description;
    return item.description;
  }

  /** 根據目前語言取得活動贈品清單 */
  getLocalizedGifts(promo: {
    gifts: string[];
    giftsJP?: string[];
    giftsKR?: string[];
  }): string[] {
    const cc = this.branchService.country;
    if (cc === 'JP') return promo.giftsJP ?? promo.gifts;
    if (cc === 'KR') return promo.giftsKR ?? promo.gifts;
    return promo.gifts;
  }

  /** 移除贈品字串中的數量（× N），只保留品名 */
  stripGiftQty(gift: string): string {
    return gift
      .replace(/\s*×\s*\d+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  getHeroPromoLocalName(): string {
    const p = this.PROMO_DISPLAY[0] ?? null;
    if (!p) return this.lang.heroSlide2Title;
    const cc = this.branchService.country;
    if (cc === 'JP') return (p as any).nameJP || p.name;
    if (cc === 'KR') return (p as any).nameKR || p.name;
    return p.name;
  }

  getHeroPromoMinSpend(): string {
    const p = this.PROMO_DISPLAY[0] ?? null;
    const cur = this.branchService.config.currency;
    return p ? `${cur}${p.minSpend}` : `${cur}300`;
  }

  getHeroPromoGiftLabel(): string {
    const p = this.PROMO_DISPLAY[0] ?? null;
    if (!p || !p.gifts?.length) return this.lang.heroSlide2DescGift;
    const cc = this.branchService.country;
    const gifts =
      cc === 'JP'
        ? (p as any).giftsJP
        : cc === 'KR'
          ? (p as any).giftsKR
          : p.gifts;
    const raw: string = gifts?.[0] ?? p.gifts[0];
    return `贈${raw}`;
  }

  getHeroPromoImage(): string {
    const p = this.PROMO_DISPLAY[0] ?? null;
    return p ? p.image : '/assets/主頁輪播圖2.jpg';
  }

  getChefPickImage(): string {
    const item = this.menuItems().find((i) => i.name === this.CHEF_PICKS[0]);
    return item?.image || '/assets/主頁輪播圖3.jpg';
  }

  /** 判斷贈品是否無庫存（quantity = 0）→ 顯示淡色、不可選 */
  isGiftOutOfStock(giftStr: string): boolean {
    const name = this.stripGiftQty(giftStr);
    return this.outOfStockGifts.has(name);
  }

  /** 根據目前語言取得活動亮點清單 */
  getLocalizedHighlights(promo: {
    highlights: string[];
    highlightsJP?: string[];
    highlightsKR?: string[];
  }): string[] {
    const cc = this.branchService.country;
    if (cc === 'JP') return promo.highlightsJP ?? promo.highlights;
    if (cc === 'KR') return promo.highlightsKR ?? promo.highlights;
    return promo.highlights;
  }

  /** 根據中文名稱查找 menuItems 並取得本地化名稱 */
  getLocalizedMenuName(chineseName: string): string {
    const item = this.menuItems().find((i) => i.name === chineseName);
    return item ? this.getLocalizedName(item) : chineseName;
  }

  /** 根據中文名稱查找 menuItems 並取得本地化描述 */
  getLocalizedMenuDesc(chineseName: string): string {
    const item = this.menuItems().find((i) => i.name === chineseName);
    return item ? this.getLocalizedDesc(item) : '';
  }

  /** 根據中文名稱查找 menuItems 並取得售價 */
  getMenuItemPrice(chineseName: string): number {
    return this.menuItems().find((i) => i.name === chineseName)?.price ?? 0;
  }

  /** 根據目前語言取得訂單品項文字 */
  getLocalizedOrderItems(order: {
    items: string;
    itemsJP?: string;
    itemsKR?: string;
  }): string {
    const cc = this.branchService.country;
    if (cc === 'JP') return order.itemsJP ?? order.items;
    if (cc === 'KR') return order.itemsKR ?? order.items;
    return order.items;
  }

  /* 已選活動名稱（'' = 未選, '不參加活動優惠' = 放棄） */
  selectedPromoName = signal<string>('');
  /* 已選活動內的贈品 */
  selectedPromoGift = signal<string>('');
  /* 結帳頁綠色贈品面板是否展開 */
  promoGiftPanelOpen = signal(false);
  /* 菜單頁各活動進度條的展開狀態（key = 活動名稱） */
  promoProgressExpanded = signal<Record<string, boolean>>({});
  /* 菜單頁：整個活動抽屜是否展開 */
  promoDrawerOpen = signal<boolean>(false);

  /* 結帳頁：已達消費門檻的活動清單（即時依 cartTotal 篩選 PROMO_ACTIVITIES） */
  unlockedPromos = computed(() => {
    const total = this.cartTotal();
    if (total <= 0) return [];
    return this.PROMO_ACTIVITIES.filter(
      (p) => p.minSpend > 0 && total >= p.minSpend,
    );
  });

  /* 目前選中的活動物件 */
  get selectedPromoActivity() {
    return (
      this.PROMO_ACTIVITIES.find((p) => p.name === this.selectedPromoName()) ??
      null
    );
  }

  /** 已選贈品的本地化顯示名稱 */
  selectedPromoGiftLocalized = computed(() => {
    const gift = this.selectedPromoGift();
    if (!gift) return '';
    const activity = this.PROMO_ACTIVITIES.find(
      (p) => p.name === this.selectedPromoName(),
    );
    if (!activity) return gift;
    const idx = activity.gifts.indexOf(gift);
    if (idx === -1) return gift;
    const localized = this.getLocalizedGifts(activity);
    return localized[idx] ?? gift;
  });

  /* 菜單頁：整個活動抽屜展開/收折 */
  togglePromoDrawer(): void {
    this.promoDrawerOpen.update((v) => !v);
  }

  /* 菜單頁：切換特定活動進度條的展開/收折（抽屜內部） */
  togglePromoProgressBar(name: string): void {
    this.promoProgressExpanded.update((v) => ({ ...v, [name]: !v[name] }));
  }

  isPromoBarExpanded(name: string): boolean {
    return this.promoProgressExpanded()[name] ?? false;
  }

  /* 菜單頁：已達門檻的活動數量 */
  get promoCompletedCount(): number {
    return this.PROMO_ACTIVITIES.filter((p) => this.cartTotal() >= p.minSpend)
      .length;
  }

  /* 結帳頁：切換綠色贈品面板 */
  togglePromoGiftPanel(): void {
    this.promoGiftPanelOpen.update((v) => !v);
  }

  selectPromo(name: string): void {
    this.selectedPromoName.set(name);
    this.selectedPromoGift.set(''); /* 切換活動時重置贈品選擇 */
    this.promoGiftPanelOpen.set(true); /* 自動展開贈品面板 */
  }

  selectPromoGift(gift: string): void {
    this.selectedPromoGift.set(gift);
    this.promoGiftPanelOpen.set(false); /* 選完自動收折 */
  }

  /* ── 訂單預覽彈出視窗 ─────────────────────────────────── */
  showOrderPreview = signal(false);

  openOrderPreview(): void {
    if (this.cartItems().length === 0) return;
    this.showOrderPreview.set(true);
  }

  closeOrderPreview(): void {
    this.showOrderPreview.set(false);
  }

  goToPayment(): void {
    this.showOrderPreview.set(false);
    this.isPlacingOrder.set(true);
    this._createOrderAsync().catch((err) => {
      this.isPlacingOrder.set(false);
      console.error('[Order] 建立訂單失敗', err);
      const rawMsg: string = err?.error?.message ?? err?.message ?? '';
      const msg = rawMsg
        .replace('系統發生未預期錯誤，請連繫管理員。', '')
        .replace(/^\((.+)\)$/, '$1')
        .trim();
      if (msg.includes('逾時') || msg.includes('登入')) {
        alert('登入連線已逾時，請重新登入後再結帳');
        this.authService.logout();
        this.router.navigate(['/customer-login']);
      } else if (msg.includes('已轉換為訂單') || msg.includes('重複提交')) {
        this.currentCartId.set(null);
        localStorage.removeItem('lbb_cart_id');
        this._cartErrorShouldReset = true;
        this.cartErrorModalOpen.set(true);
      } else if (
        msg.includes('Coupon') ||
        msg.includes('Not Available') ||
        msg.includes('折扣') ||
        msg.includes('贈品') ||
        msg.includes('兌換')
      ) {
        const isCouponErr = msg.includes('Coupon') || msg.includes('Not Available');
        const isGiftErr = msg.includes('贈品') || msg.includes('兌換完畢');
        if (isCouponErr) {
          this.useDiscountCoupon.set(false);
          this.showCheckoutToast('折扣券無法使用，請取消勾選後重試');
        } else if (isGiftErr) {
          this._reloadCheckoutGifts(this.cartTotal());
          this.giftErrorMessage.set(msg || '很抱歉，此贈品已兌換完畢');
          this.giftErrorModalOpen.set(true);
        } else {
          this.showCheckoutToast(msg || '折扣券無法使用，請取消勾選後重試');
        }
      } else {
        this.cartErrorModalOpen.set(true);
      }
    });
  }

  private async _createOrderAsync(): Promise<void> {
    const items = this.cartItems();
    const user = this.authService.currentUser;
    const memberId = user?.isGuest ? 1 : (user?.id ?? 1);
    const phone = this.phoneToIntl(this.phoneNumber());

    /* Step 1：取得後端購物車 ID */
    let cartId = this.currentCartId();
    if (cartId === null) {
      for (const item of items) {
        const syncReq: CartSyncReq = {
          cartId: cartId || null,
          globalAreaId: this.branchService.globalAreaId,
          productId: item.id,
          quantity: item.quantity,
          operationType: 'CUSTOMER',
          memberId,
        };
        const cartRes = await firstValueFrom(this.apiService.syncCart(syncReq));
        if (!cartRes.cartId || cartRes.cartId <= 0)
          throw new Error('購物車同步失敗');
        cartId = cartRes.cartId;
      }
      this.currentCartId.set(cartId);
    }

    /* Step 2：後端計算折扣金額 */
    const scopedGiftKey = `${this.selectedPromoName()}:${this.selectedPromoGift()}`;
    const selectedGiftId = this.promoGiftIds.get(scopedGiftKey) ?? 0;
    let finalTotal = this.discountedTotal();
    const calcRes = await firstValueFrom(
      this.apiService.calculatePromotion({
        cartId: cartId!,
        memberId,
        useCoupon: this.useDiscountCoupon(),
        selectedGiftId,
        originalAmount: this.cartTotal(),
        regionsId: this.branchService.regionsId,
      }),
    );
    const calcAny = calcRes as any;
    if (calcAny?.code != null && calcAny.code !== 200) {
      const rawMsg: string = calcAny.message ?? '';
      const userMsg = rawMsg
        .replace('系統發生未預期錯誤，請連繫管理員。', '')
        .trim();
      throw new Error(userMsg || '折扣計算失敗，請確認折扣券是否有效');
    }
    if (calcRes?.finalAmount != null) finalTotal = calcRes.finalAmount;

    /* Step 3：建立訂單（不含付款方式，待付款頁選擇後處理） */
    const giftProductId =
      this.promoGiftProductIds.get(scopedGiftKey) ?? 0;
    const promotionsId =
      this.promoNameToId.get(this.selectedPromoName()) ?? undefined;
    const giftDetailItem: OrderCartDetailItem[] =
      selectedGiftId > 0
        ? [
          {
            productId: giftProductId,
            quantity: 1,
            gift: true,
            promotionsGiftsId: selectedGiftId,
          },
        ]
        : [];

    const orderReq: CreateOrdersReq = {
      orderCartId: String(cartId),
      globalAreaId: this.branchService.globalAreaId,
      memberId,
      phone,
      subtotalBeforeTax: this.cartTotal(),
      taxAmount: 0,
      totalAmount: finalTotal,
      useDiscount: this.useDiscountCoupon(),
      orderCartDetailsList: [
        ...items.map((i) => ({
          productId: i.id,
          quantity: i.quantity,
          gift: false,
        })),
        ...giftDetailItem,
      ],
      ...(promotionsId !== undefined && { promotionsId }),
    };

    const orderRes = await firstValueFrom(
      this.apiService.createOrder(orderReq),
    );

    if (orderRes.code !== 200 || !orderRes.id) {
      throw new Error(orderRes.message ?? '建立訂單失敗，請稍後再試');
    }

    /* 儲存訂單資訊供付款步驟使用 */
    this.pendingOrderId.set(orderRes.id);
    this.pendingOrderDateId.set(orderRes.orderDateId);
    this.backendConfirmedTotal.set(orderRes.totalAmount ?? finalTotal);

    /* 購物車已轉為訂單，清除本地 cartId，避免重試時帶入已使用的舊 cart */
    this.currentCartId.set(null);
    localStorage.removeItem('lbb_cart_id');

    this.isPlacingOrder.set(false);
    this.setTab('payment');
  }

  /* 取消本次訂單：清空購物車並回到首頁 */
  cancelCurrentOrder(): void {
    this.clearCart();
    this.selectedPromoName.set('');
    this.selectedPromoGift.set('');
    this.promoGiftPanelOpen.set(false);
    this.useDiscountCoupon.set(false);
    /* 重置信用卡表單 */
    this.cardNumber.set('');
    this.cardExpiry.set('');
    this.cardCvv.set('');
    this.cardHolder.set('');
    this.cardFlipped.set(false);
    /* 重置行動支付 Modal */
    this.closeMobilePayModal();
    localStorage.removeItem('lbb_tracking_order');
    this.setTab('home');
  }

  /* ── 折扣兌換券 ─────────────────────────────────────── */
  useDiscountCoupon = signal(false);

  toggleDiscountCoupon(): void {
    this.useDiscountCoupon.update((v) => !v);
  }

  /* ── 側邊欄：進度與折扣邏輯 ────────── */
  memberOrderCount = signal(0);
  discountThreshold = signal(2);
  memberHasDiscount = signal(false);

  ordersUntilDiscount = computed(() => {
    const total = this.memberOrderCount();
    const n = this.discountThreshold();
    const remainder = total % n;
    if (remainder === 0 && total > 0) return 0;
    return n - remainder;
  });

  discountProgressPct = computed(() => {
    if (this.hasDiscountReady()) return 100;
    const n = this.discountThreshold();
    if (n <= 0) return 0;
    return (this.memberOrderCount() % n) / n * 100;
  });

  hasDiscountReady = computed(() => {
    if (this.memberHasDiscount()) return true;
    const total = this.memberOrderCount();
    const n = this.discountThreshold();
    return n > 0 && total > 0 && total % n === 0;
  });

  /* 總計（使用折扣券時才生效，折扣上限 NT$200） */
  discountedTotal = computed(() => {
    if (this.useDiscountCoupon()) {
      const raw = Math.round(this.cartTotal() * 0.9);
      const discount = Math.min(this.cartTotal() - raw, 200);
      return this.cartTotal() - discount;
    }
    return this.cartTotal();
  });

  /* 折扣省下金額 */
  discountAmount = computed(() => {
    return this.cartTotal() - this.discountedTotal();
  });

  /* 行動支付 QR Code URL（手機掃碼後開啟的付款確認頁） */
  mobilePayUrl = computed(() => {
    const items = this.cartItems().map((i) => ({
      name: i.name,
      qty: i.quantity,
      price: i.price,
    }));
    const params = new URLSearchParams({
      store: '懶飽飽 Lazy BaoBao',
      amount: this.discountedTotal().toString(),
      items: JSON.stringify(items),
      'ngrok-skip-browser-warning': 'true',
    });
    return `${DEMO_BASE_URL}/mobile-pay?${params.toString()}`;
  });

  /* ── 即時追蹤訂單（從 OrderService 取得最新客戶訂單） ── */
  trackingOrder = computed<TrackingOrder | null>(() => {
    const o = this.orderService.latestCustomerOrder();
    if (!o) return null;
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      estimatedMinutes: o.estimatedMinutes,
      items: o.items,
      total: o.total,
      createdAt: o.createdAt,
      payMethod: o.payMethod,
      isCash: o.isCash ?? o.payMethod === '現金',
    };
  });

  /* ── 底部導覽列定義（語言響應式） ────────────────── */
  navTabs = computed<NavTab[]>(() => {
    const l = this.branchService.lang();
    const ALL: NavTab[] = [
      { id: 'home', label: l.navHome, icon: 'home' },
      { id: 'menu', label: l.navMenu, icon: 'menu' },
      { id: 'checkout', label: l.navCart, icon: 'checkout' },
      { id: 'orders', label: l.navOrders, icon: 'orders' },
      { id: 'promotions', label: l.navPromos, icon: 'promotions' },
    ];
    return this.isGuest() ? ALL.filter((t) => t.id !== 'orders') : ALL;
  });

  /* ── 訂單管理資料 ──────────────────────────────────── */
  activeOrderTab = signal<'active' | 'completed' | 'cancelled' | 'refunded'>(
    'active',
  );
  activeOrders = signal<ActiveOrder[]>([]);

  /* ── 退款申請 Modal ─────────────────────────────────── */
  refundModalOpen = signal(false);
  refundTargetOrder = signal<{ id: string; total: number } | null>(null);
  refundSubmitted = signal(false);

  refundChecked = signal<Record<string, boolean>>({
    r1: false,
    r2: false,
    r3: false,
    r4: false,
    r5: false,
    r6: false,
    r7: false,
  });

  refundReasons = computed(() => {
    const l = this.branchService.lang();
    const c = this.refundChecked();
    return [
      { id: 'r1', label: l.refundR1, checked: c['r1'] },
      { id: 'r2', label: l.refundR2, checked: c['r2'] },
      { id: 'r3', label: l.refundR3, checked: c['r3'] },
      { id: 'r4', label: l.refundR4, checked: c['r4'] },
      { id: 'r5', label: l.refundR5, checked: c['r5'] },
      { id: 'r6', label: l.refundR6, checked: c['r6'] },
      { id: 'r7', label: l.refundR7, checked: c['r7'] },
    ];
  });
  refundOtherText = signal('');

  hasRefundSelection = computed(
    () =>
      Object.values(this.refundChecked()).some((v) => v) ||
      this.refundOtherText().trim().length > 0,
  );

  /* ── 取消追蹤中訂單（方案 A：tracker tab）────────── */
  cancelConfirmOpen = signal(false);

  guestSuccessModalOpen = signal(false);

  cartErrorModalOpen = signal(false);
  private _cartErrorShouldReset = false;

  giftErrorModalOpen = signal(false);
  giftErrorMessage = signal('');

  closeGiftErrorModal(): void {
    this.giftErrorModalOpen.set(false);
  }

  closeCartErrorModal(): void {
    this.cartErrorModalOpen.set(false);
    if (this._cartErrorShouldReset) {
      this._cartErrorShouldReset = false;
      this.resetLocalCart();
    }
  }
  guestSuccessPhone = signal('');
  guestSuccessBranchName = signal('');

  openCancelConfirm(): void {
    this.cancelConfirmOpen.set(true);
  }

  closeCancelConfirm(): void {
    this.cancelConfirmOpen.set(false);
  }

  confirmCancelOrder(): void {
    const dbId = this._activeOrderDbId;
    if (!dbId) {
      this.cancelConfirmOpen.set(false);
      return;
    }
    this.apiService
      .updateOrderStatus({
        id: dbId.id,
        orderDateId: dbId.orderDateId,
        ordersStatus: 'CANCELLED',
      })
      .subscribe({
        next: (res) => {
          this._clearLocalTracking(dbId.id);
          this.cancelConfirmOpen.set(false);
          if (res?.code !== 200) {
            alert('後端無法取消此訂單，已從追蹤清單移除。');
          }
        },
        error: () => {
          /* 後端拒絕（如 400 Member ERROR）：本地追蹤仍可清除，讓使用者不被卡住 */
          this._clearLocalTracking(dbId.id);
          this.cancelConfirmOpen.set(false);
          alert('後端無法取消此訂單，已從追蹤清單移除。');
        },
      });
  }

  cancelActiveOrder(trackId: string): void {
    const dbId = this._activeOrderDbId;
    if (!dbId) {
      this.activeOrders.set(
        this.activeOrders().filter((o) => o.id !== trackId),
      );
      localStorage.removeItem('lbb_tracking_order');
      return;
    }
    this.apiService
      .updateOrderStatus({
        id: dbId.id,
        orderDateId: dbId.orderDateId,
        ordersStatus: 'CANCELLED',
      })
      .subscribe({
        next: () => {
          this.activeOrders.set(
            this.activeOrders().filter((o) => o.id !== trackId),
          );
          this._activeOrderDbId = null;
          const iv = this.statusPollIntervals.get(trackId);
          if (iv) { clearInterval(iv); this.statusPollIntervals.delete(trackId); }
          localStorage.removeItem('lbb_tracking_order');
        },
        error: () => {
          this.activeOrders.set(
            this.activeOrders().filter((o) => o.id !== trackId),
          );
          localStorage.removeItem('lbb_tracking_order');
        },
      });
  }

  private _clearLocalTracking(rawOrderId: string): void {
    const dateId = this._activeOrderDbId?.orderDateId;
    const fullId = dateId ? `DB-${dateId}-${rawOrderId}` : rawOrderId;
    this.orderService.removeOrder(fullId);
    this._activeOrderDbId = null;
    const iv = this.statusPollIntervals.get(fullId);
    if (iv) { clearInterval(iv); this.statusPollIntervals.delete(fullId); }
    localStorage.removeItem('lbb_tracking_order');
  }

  openRefundModal(order: { id: string; total: number }): void {
    this.refundTargetOrder.set(order);
    this.refundChecked.set({
      r1: false,
      r2: false,
      r3: false,
      r4: false,
      r5: false,
      r6: false,
      r7: false,
    });
    this.refundOtherText.set('');
    this.refundSubmitted.set(false);
    this.refundModalOpen.set(true);
  }

  closeRefundModal(): void {
    this.refundModalOpen.set(false);
    this.refundTargetOrder.set(null);
  }

  toggleRefundReason(id: string): void {
    this.refundChecked.update((c) => ({ ...c, [id]: !c[id] }));
  }

  updateRefundOther(value: string): void {
    this.refundOtherText.set(value);
  }

  submitRefund(): void {
    if (!this.hasRefundSelection()) return;
    const order = this.refundTargetOrder();
    if (!order) return;

    // 從 id 解析出 orderDateId（格式 LBB-YYYYMMDD-XXXX）
    const parts = order.id.split('-');
    const orderDateId = parts[1] ?? '';

    this.apiService
      .updateOrderStatus({
        id: order.id,
        orderDateId,
        ordersStatus: 'REFUNDED',
      })
      .subscribe({
        next: () => {
          // 本地狀態更新
          this.orderHistoryList.set(
            this.orderHistoryList().map((o) =>
              o.id === order.id ? { ...o, status: 'refunded' as const } : o,
            ),
          );
          this.refundSubmitted.set(true);
          setTimeout(() => this.closeRefundModal(), 2000);
        },
        error: () => {
          // API 失敗仍顯示成功（Demo 用）
          this.refundSubmitted.set(true);
          setTimeout(() => this.closeRefundModal(), 2000);
        },
      });
  }

  orderHistoryList = signal<{
    id: string;
    date: string;
    items: string;
    itemsJP: string;
    itemsKR: string;
    total: number;
    status: string;
  }[]>([]);

  completedCount = computed(
    () =>
      this.orderHistoryList().filter((o) => o.status === 'completed').length,
  );
  cancelledCount = computed(
    () =>
      this.orderHistoryList().filter((o) => o.status === 'cancelled').length,
  );
  refundedCount = computed(
    () => this.orderHistoryList().filter((o) => o.status === 'refunded').length,
  );

  filteredOrders = computed(() => {
    const tab = this.activeOrderTab();
    if (tab === 'active') return []; // active tab 用 activeOrders() 直接顯示
    return this.orderHistoryList().filter((o) => o.status === tab);
  });

  /* ── 國家切換 ──────────────────────────────────────── */
  allCountries = signal<CountryConfig[]>([]);
  activeCountry = signal<CountryCode>('TW');

  /** 語言字典快捷 getter（供 HTML 直接使用） */
  get lang() {
    return this.branchService.lang();
  }

  constructor(
    private router: Router,
    public authService: AuthService,
    private loadingService: LoadingService,
    public orderService: OrderService,
    private apiService: ApiService,
    public branchService: BranchService,
  ) {
    /* 當 BroadcastChannel 將 POS 的狀態廣播過來時，同步更新 activeOrders 的顯示步驟 */
    effect(() => {
      const live = this.orderService.orders();
      if (this.activeOrders().length === 0) return;
      this.activeOrders.update((list) => {
        let changed = false;
        const updated = list.map((ao) => {
          const lo = live.find((o) => o.id === ao.id);
          if (!lo) return ao;
          const isCashOrder = ao.isCash ?? ao.payMethod === '現金';
          const isTerminal = isCashOrder
            ? lo.status === 'paid'
            : lo.status === 'paid' || lo.status === 'done';
          if (isTerminal) {
            /* 排程 7 秒後移除（避免重複排程） */
            if (!this._removalTimers.has(ao.id)) {
              setTimeout(() => this._scheduleOrderCompletion(ao.id), 0);
            }
            /* 先顯示「取餐完畢」步驟（status='done'） */
            if (ao.status === 'done') return ao;
            changed = true;
            return { ...ao, status: 'done' as ActiveOrder['status'] };
          }
          const mapped: ActiveOrder['status'] =
            lo.status === 'ready' || lo.status === 'pending-cash'
              ? 'ready'
              : 'cooking';
          if (ao.status === mapped) return ao;
          changed = true;
          return { ...ao, status: mapped };
        });
        return changed ? updated : list;
      });
    });
    // 購物車金額低於門檻時，自動清除已選贈品（針對 PROMO_ACTIVITIES 選單頁進度條）
    effect(() => {
      const total = this.cartTotal();
      const promoName = this.selectedPromoName();
      if (!promoName || promoName === '不參加活動優惠') return;

      const promo = this.PROMO_ACTIVITIES.find((p) => p.name === promoName);
      if (promo && total < promo.minSpend) {
        this.selectedPromoName.set('');
        this.selectedPromoGift.set('');
        this.promoGiftPanelOpen.set(false);
      }
    });
    // 購物車金額變動時，即時向後端查詢可選贈品
    effect(() => {
      const total = this.cartTotal();
      this._reloadCheckoutGifts(total);
    });
  }

  selectCountry(code: CountryCode): void {
    this.branchService.setCountry(code);
    this.activeCountry.set(code);
  }

  ngOnInit(): void {
    if (!this.authService.currentUser) {
      this.authService.loginAsGuest('');
    }
    this.branchService.init();
    this.allCountries.set(this.branchService.allCountries);
    this.activeCountry.set(this.branchService.country);
    /* 啟動首頁輪播自動播放（5 秒換一張） */
    this.heroTimer = setInterval(() => {
      if (!this.heroPaused) {
        this.heroSlideIndex.update((i) => (i + 1) % this.HERO_SLIDE_COUNT);
      }
    }, 5000);

    /* 啟動促銷橫幅自動輪播（3 秒換一則活動） */
    this.promoBannerTimer = setInterval(() => {
      this.promoBannerIndex.update(
        (i) => (i + 1) % this.PROMO_ACTIVITIES.length,
      );
    }, 3000);

    /* 會員自動填入電話號碼（訪客保持空白，為必填），轉為本地格式顯示 */
    const user = this.authService.currentUser;
    if (user && !user.isGuest && user.phone) {
      this.phoneNumber.set(this.phoneToLocal(user.phone));
    }

    /* 從後端 currentMember 初始化訂單累積次數與折扣狀態 */
    const memberData = this.authService.currentMember;
    if (memberData?.orderCount != null) {
      this.memberOrderCount.set(memberData.orderCount);
    }
    if (memberData?.isDiscount === true) {
      this.memberHasDiscount.set(true);
    }

    /* 載入折扣設定，依當前 regionsId 取得累積次數門檻，並正規化週期計數 */
    this.apiService.getDiscountList().subscribe({
      next: (res) => {
        const rid = this.branchService.regionsId;
        const disc = res?.discountList?.find((d) => d.regionsId === rid);
        if (disc?.count && disc.count > 0) {
          const n = disc.count;
          this.discountThreshold.set(n);
          const totalOrders = this.authService.currentMember?.orderCount ?? 0;
          const remainder = totalOrders % n;
          this.memberOrderCount.set(remainder === 0 && totalOrders > 0 ? n : remainder);
        }
      },
    });

    /* 載入促銷活動（API 成功則覆蓋靜態 Demo 資料，只顯示 active 的活動） */
    this.loadPromotions();

    /* 從後端還原購物車（頁面重整 / 重新登入後恢復上次品項） */

    // 從 localStorage 重建追蹤中訂單（只還原當日訂單，昨天或更舊的自動清除）
    const savedTracking = localStorage.getItem('lbb_tracking_order');
    if (savedTracking) {
      try {
        const t = JSON.parse(savedTracking);
        const d = new Date();
        const todayStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        if (t.orderDateId && t.orderDateId !== todayStr) {
          localStorage.removeItem('lbb_tracking_order');
        } else {
          this.orderService.addOrder({
            id: t.orderId,
            number: t.number,
            status: t.status,
            estimatedMinutes: t.estimatedMinutes,
            items: t.items,
            total: t.total,
            createdAt: t.createdAt,
            payMethod: t.payMethod,
            source: 'customer',
          });

          // 同步還原至 activeOrders
          const restoredAoStatus =
            t.status === 'waiting'
              ? 'cooking'
              : t.status === 'cooking'
                ? 'cooking'
                : t.status === 'ready'
                  ? 'ready'
                  : 'done';
          this.activeOrders.set([
            {
              id: t.orderId,
              number: t.number,
              status: restoredAoStatus as ActiveOrder['status'],
              items: t.items,
              total: t.total,
              createdAt: t.createdAt,
              payMethod: t.payMethod,
              isCash: t.isCash ?? t.payMethod === '現金',
              estimatedMinutes: t.estimatedMinutes,
            },
            ...this.activeOrders(),
          ]);

          if (t.orderDateId) {
            // 從 trackId 反解原始 orderId（DB-20260424-0009 → 0009）
            const rawOrderId = t.orderId.startsWith('DB-')
              ? t.orderId.split('-').slice(2).join('-')
              : t.orderId;

            this._activeOrderDbId = {
              id: rawOrderId,
              orderDateId: t.orderDateId,
            };

            const isCash = t.isCash ?? t.payMethod === '現金';
            const endStatus: OrderStatus = isCash ? 'paid' : 'done';

            const existingIv = this.statusPollIntervals.get(t.orderId);
            if (existingIv) { clearInterval(existingIv); this.statusPollIntervals.delete(t.orderId); }
            this.statusPollIntervals.set(t.orderId, setInterval(() => {
              this.apiService
                .getOrderStatus(rawOrderId, t.orderDateId)
                .subscribe({
                  next: (res) => {
                    if (res?.code !== 200) return;

                    const statusMap: Record<string, OrderStatus> = isCash
                      ? {
                        PREPARING: 'waiting',
                        PENDING_CASH: 'waiting',
                        WAITING: 'waiting',
                        COOKING: 'cooking',
                        READY: 'ready',
                        AWAITING_PAYMENT: 'pending-cash',
                        PICKED_UP: 'paid',
                        COMPLETED: 'paid',
                      }
                      : {
                        PREPARING: 'waiting',
                        WAITING: 'waiting',
                        COOKING: 'cooking',
                        READY: 'done',
                        PICKED_UP: 'done',
                        COMPLETED: 'done',
                      };

                    const cur = this.orderService
                      .orders()
                      .find((o) => o.id === t.orderId);
                    /* 已達終態時停止輪詢（現金=paid，非現金=done） */
                    if (cur?.status === endStatus || cur?.status === 'paid') {
                      const iv2 = this.statusPollIntervals.get(t.orderId);
                      if (iv2) { clearInterval(iv2); this.statusPollIntervals.delete(t.orderId); }
                      this._scheduleOrderCompletion(t.orderId);
                      return;
                    }
                    const newStatus =
                      statusMap[res.message] ?? cur?.status ?? 'waiting';
                    if (!cur || cur.status !== newStatus) {
                      this.orderService.updateStatus(t.orderId, newStatus);
                    }
                    /* 同步更新 activeOrders 顯示狀態 */
                    const aoStatus =
                      newStatus === 'waiting' ? 'cooking' :
                        newStatus === 'cooking' ? 'cooking' :
                          newStatus === 'ready' ? 'ready' : 'done';
                    this.activeOrders.set(
                      this.activeOrders().map((o) =>
                        o.id === t.orderId ? { ...o, status: aoStatus as ActiveOrder['status'] } : o,
                      ),
                    );

                    if (newStatus === endStatus) {
                      const iv2 = this.statusPollIntervals.get(t.orderId);
                      if (iv2) { clearInterval(iv2); this.statusPollIntervals.delete(t.orderId); }
                      this._scheduleOrderCompletion(t.orderId);
                    }
                  },
                  error: () => { },
                });
            }, 5000));
          }
        } // end else (today's order)
      } catch {
        localStorage.removeItem('lbb_tracking_order');
      }
    }

    /* 載入菜單商品（先嘗試 menu 端點；失敗或空回傳時改用庫存端點） */
    const areaId = this.branchService.globalAreaId;

    forkJoin({
      menu: this.apiService.getActiveProducts(areaId),
      inventory: this.apiService.getBranchInventory(areaId).pipe(
        catchError(() => of(null)),
      ),
      allProducts: this.apiService.getAllProducts().pipe(
        catchError(() => of(null)),
      ),
    }).subscribe({
      next: ({ menu, inventory, allProducts }) => {
        /* 以 getBranchInventory 的 style/category/price 作為補充來源（API 失敗時 inventory 為 null） */
        const invData = inventory?.data ?? [];
        const invStyleMap = new Map<number, string>(
          invData.map((inv) => [inv.productId, inv.style ?? '']),
        );
        const invCatMap = new Map<number, string>(
          invData.map((inv) => [inv.productId, inv.category ?? '']),
        );
        /* 當 menu API 回傳 basePrice=0 時，從庫存端點補正確售價 */
        const invPriceMap = new Map<number, number>(
          invData.map((inv) => [inv.productId, inv.basePrice]),
        );
        /* 管理端商品作為 style/category 的最終補充（productId 對應 admin id） */
        const adminStyleMap = new Map<number, string>(
          (allProducts?.productList ?? []).map((p) => [p.id, p.style ?? '']),
        );
        const adminCatMap = new Map<number, string>(
          (allProducts?.productList ?? []).map((p) => [p.id, p.category ?? '']),
        );

        if (menu?.data?.length) {
          const mapped = menu.data
            .map((p) => {
              const i18n = CustomerHomeComponent.MENU_I18N[p.name] ?? {};
              return {
                id: p.productId,
                name: p.name,
                nameEn: i18n.nameEn ?? p.name,
                nameJP: i18n.nameJP,
                nameKR: i18n.nameKR,
                price: p.basePrice || invPriceMap.get(p.productId) || 0,
                image: p.foodImgBase64 ?? '',
                category: p.category || invCatMap.get(p.productId) || adminCatMap.get(p.productId) || '',
                categoryEn: p.category || invCatMap.get(p.productId) || adminCatMap.get(p.productId) || '',
                style: p.style || invStyleMap.get(p.productId) || adminStyleMap.get(p.productId) || '',
                description: p.description ?? '',
                descriptionJP: i18n.descriptionJP,
                descriptionKR: i18n.descriptionKR,
                stock: p.stockQuantity,
              };
            })
            .filter((item) => item.price > 0);
          const hasCategories = mapped.some((p) => p.category);
          if (hasCategories) {
            this.menuItems.set(mapped);
          } else {
            this.menuItems.update((existing) =>
              mapped.map((p) => {
                const old = existing.find((e) => e.id === p.id);
                return old
                  ? { ...p, category: old.category, categoryEn: old.categoryEn, style: old.style || p.style }
                  : p;
              }),
            );
          }
        } else if (inventory?.data?.length) {
          /* menu API 無資料時改用庫存端點 */
          const active = inventory.data.filter((i) => i.active && i.basePrice > 0);
          if (active.length > 0) {
            this.menuItems.set(
              active.map((p) => {
                const i18n = CustomerHomeComponent.MENU_I18N[p.productName] ?? {};
                return {
                  id: p.productId,
                  name: p.productName,
                  nameEn: i18n.nameEn ?? p.productName,
                  nameJP: i18n.nameJP,
                  nameKR: i18n.nameKR,
                  price: p.basePrice,
                  image: '',
                  category: p.category,
                  categoryEn: p.category,
                  style: p.style ?? '',
                  description: '',
                  descriptionJP: i18n.descriptionJP,
                  descriptionKR: i18n.descriptionKR,
                  stock: p.stockQuantity,
                };
              }),
            );
          }
        }
        this._restoreCart();
      },
      error: () => {
        console.warn('[Customer] 菜單 API 連線失敗，使用 Demo 資料');
        this._restoreCart();
      },
    });

    /* 載入真實歷史訂單（僅會員，訪客跳過）
     * ⚠ 需後端 MembersController 建立後，memberId 才會對應真實資料庫 ID
     * 目前 AuthService 的 mock 帳號 id=1 為訪客預設，登入後 id 若有值則嘗試取得 */
    const userForOrders = this.authService.currentUser;
    if (!userForOrders?.isGuest && userForOrders?.id && userForOrders.id > 0) {
      this.apiService.getAllOrders({ memberId: userForOrders.id }).subscribe({
        next: (res) => {
          if (res?.getOrderVoList?.length) {
            this.orderHistoryList.set(
              res.getOrderVoList.map((o: GetOrdersVo) => ({
                id: o.id,
                date: o.completedAt?.slice(0, 10) ?? o.orderDateId ?? '',
                items: (
                  o.GetOrdersDetailVoList ??
                  o.getOrdersDetailVoList ??
                  []
                )
                  .filter((d: GetOrdersDetailVo) => !d.gift)
                  .map(
                    (d: GetOrdersDetailVo) =>
                      `${d.name || d.productName || '?'} × ${d.quantity}`,
                  )
                  .join('、'),
                itemsJP: '',
                itemsKR: '',
                total: +o.totalAmount,
                status:
                  o.ordersStatus === 'COMPLETED'
                    ? ('completed' as const)
                    : o.ordersStatus === 'CANCELLED'
                      ? ('cancelled' as const)
                      : o.ordersStatus === 'REFUNDED'
                        ? ('refunded' as const)
                        : ('completed' as const),
              })),
            );
          }
          /* 若後端回空清單，保留 mock 歷史訂單供 Demo 使用 */
        },
        error: () =>
          console.warn('[Customer] 訂單歷史 API 連線失敗，使用 Demo 資料'),
      });
    }
  }

  /* 客戶端廚房狀態輪詢計時器（key = trackId，支援多筆同時追蹤） */
  private statusPollIntervals = new Map<string, ReturnType<typeof setInterval>>();
  /* LINE Pay 付款完成輪詢計時器 */
  private linePayPollInterval: ReturnType<typeof setInterval> | null = null;
  /* 目前追蹤中訂單的 DB 識別碼 */
  private _activeOrderDbId: { id: string; orderDateId: string } | null = null;

  private _restoreCart(): void {
    const savedCartId = Number(localStorage.getItem('lbb_cart_id'));
    if (!savedCartId) return;

    const user = this.authService.currentUser;
    const memberId = user?.isGuest ? 1 : (user?.id ?? 1);
    const validIds = new Set(this.menuItems().map((m) => m.id));

    this.apiService.viewCart(savedCartId, memberId).subscribe({
      next: (res) => {
        if (res?.items?.length) {
          this.currentCartId.set(res.cartId || null);
          this.cartItems.set(
            res.items
              .filter((i) => !i.gift && validIds.has(i.productId))
              .map((i) => ({
                id: i.productId,
                name: i.productName,
                nameEn: i.productName,
                price: i.price,
                quantity: i.quantity,
                image: '',
                category: '',
              })),
          );
        }
      },
      error: () => localStorage.removeItem('lbb_cart_id'),
    });
  }

  ngOnDestroy(): void {
    if (this.heroTimer) clearInterval(this.heroTimer);
    if (this.promoBannerTimer) clearInterval(this.promoBannerTimer);
    if (this.mobilePayTimer) clearTimeout(this.mobilePayTimer);
    this.statusPollIntervals.forEach((iv) => clearInterval(iv));
    this.statusPollIntervals.clear();
    if (this.linePayPollInterval) clearInterval(this.linePayPollInterval);
    this._giftsSubscription?.unsubscribe();
    this._removalTimers.forEach((t) => clearTimeout(t));
    this._removalTimers.clear();
  }

  /** 根據購物車金額向後端即時查詢可選贈品（僅更新 checkoutGifts，promoGiftIds 由 loadPromotions 管理） */
  private _reloadCheckoutGifts(total: number): void {
    this._giftsSubscription?.unsubscribe();
    if (total <= 0) {
      this.checkoutGifts.set([]);
      return;
    }
    this._giftsSubscription = this.apiService
      .getAvailableGifts(total)
      .pipe(catchError(() => of([])))
      .subscribe((gifts) => {
        const list = (gifts as GiftItem[]) ?? [];
        this.checkoutGifts.set(list);
        // 若已選的贈品所屬活動或贈品已不再可用，自動清除選擇
        const sel = this.selectedPromoGift();
        const promoName = this.selectedPromoName();
        if (sel && promoName && !this.promoGiftIds.has(`${promoName}:${sel}`)) {
          this.selectedPromoGift.set('');
          this.selectedPromoName.set('');
          this.promoGiftPanelOpen.set(false);
        }
      });
  }

  /* ── LINE Pay 輪詢：每 3 秒查一次訂單狀態直到 COMPLETED ── */
  private _startLinePayPoll(orderId: string, orderDateId: string): void {
    if (this.linePayPollInterval) clearInterval(this.linePayPollInterval);
    this.linePayPollInterval = setInterval(() => {
      this.apiService.getOrderStatus(orderId, orderDateId).subscribe({
        next: (res) => {
          if (
            res?.code === 200 &&
            res?.message !== 'UNPAID' &&
            res?.message !== 'NOT_FOUND'
          ) {
            this._clearLinePayPoll();
            this._afterOrderSuccess(orderId, orderDateId, 'waiting', false);
          }
        },
        error: () => { },
      });
    }, 3000);
  }

  private _clearLinePayPoll(): void {
    if (this.linePayPollInterval) {
      clearInterval(this.linePayPollInterval);
      this.linePayPollInterval = null;
    }
    this.linePayQrUrl.set(null);
    this.linePayPollOrderId.set(null);
    this.linePayPollOrderDateId.set('');
  }

  cancelLinePayQr(): void {
    this._clearLinePayPoll();
    this.isPlacingOrder.set(false); // 取消後才釋放按鈕
  }

  /** 顯示「取餐完畢」步驟 7 秒後，將訂單從未完成移至已完成 */
  private _scheduleOrderCompletion(orderId: string): void {
    if (this._removalTimers.has(orderId)) return;
    const timer = setTimeout(() => {
      this._removalTimers.delete(orderId);
      this.activeOrders.update((list) => list.filter((o) => o.id !== orderId));
      localStorage.removeItem('lbb_tracking_order');
    }, 7000);
    this._removalTimers.set(orderId, timer);
  }

  /* ── 切換頁籤 ─────────────────────────────────────── */
  setTab(tab: TabId): void {
    if (tab === 'orders' && this.isGuest()) {
      return;
    }
    this.activeTab.set(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── 加入購物車 ──────────────────────────────────── */
  addToCart(item: MenuItem): void {
    if (!this.menuItems().some((m) => m.id === item.id)) return;
    const current = this.cartItems();
    const existing = current.find((c) => c.id === item.id);
    const newQty = existing ? existing.quantity + 1 : 1;
    if (existing) {
      this.cartItems.set(
        current.map((c) =>
          c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        ),
      );
    } else {
      this.cartItems.set([
        ...current,
        {
          id: item.id,
          name: item.name,
          nameEn: item.nameEn,
          nameJP: item.nameJP,
          nameKR: item.nameKR,
          price: item.price,
          quantity: 1,
          image: item.image,
          category: item.category,
        },
      ]);
    }
    if (navigator.vibrate) navigator.vibrate(30);
    this._syncCartItemToBackend(item.id, newQty);
  }

  private loadPromotions(): void {
    this.apiService.getPromotionsList().subscribe({
      next: (res) => {
        const allData = res?.data ?? [];
        const active = allData
          .filter(
            (p: PromotionDetailVo) => p.active && p.gifts && p.gifts.length > 0,
          )
          .sort((a: PromotionDetailVo, b: PromotionDetailVo) => b.id - a.id);
        const allActive = allData
          .filter((p: PromotionDetailVo) => p.active)
          .sort((a: PromotionDetailVo, b: PromotionDetailVo) => b.id - a.id);
        if (!allActive.length) return;

        // 根據目前分店語言選取正確的活動名稱
        const cc = this.branchService.country;
        const localName = (p: PromotionDetailVo) => {
          if (cc === 'JP') return p.nameJP || p.name;
          if (cc === 'KR') return p.nameKR || p.name;
          return p.name;
        };

        this.promoGiftIds.clear();
        this.promoGiftProductIds.clear();
        this.promoNameToId.clear();
        this.outOfStockGifts.clear();
        this.PROMO_ACTIVITIES = active
          .map((p: PromotionDetailVo) => {
            const minSpend = p.gifts.length
              ? Math.min(...p.gifts.map((g) => g.fullAmount))
              : 0;
            const lName = localName(p);
            this.promoNameToId.set(lName, p.id); // 活動名稱 → promotions.id（後端扣除配額用）
            const seen = new Set<string>();
            const giftNames: string[] = [];
            p.gifts.forEach((g) => {
              // is_active=false 或庫存 0 → 標記無庫存，不提供選取
              if (!g.active || g.quantity === 0) {
                this.outOfStockGifts.add(g.productName);
                return;
              }
              const key = `${g.productName} × 1`;
              // 用「活動名稱:贈品名稱」做 key，避免同一贈品在多個活動互蓋
              this.promoGiftIds.set(`${lName}:${key}`, g.id);
              this.promoGiftProductIds.set(`${lName}:${key}`, g.giftProductId);
              if (!seen.has(key)) {
                seen.add(key);
                giftNames.push(key);
              }
            });
            return {
              name: lName,
              nameJP: p.nameJP || lName,
              nameKR: p.nameKR || lName,
              minSpend,
              gifts: giftNames,
              giftsJP: giftNames,
              giftsKR: giftNames,
            };
          })
          .sort((a, b) => a.minSpend - b.minSpend);

        this.PROMO_DISPLAY = allActive.map(
          (p: PromotionDetailVo, i: number) => {
            const hasGifts = p.gifts && p.gifts.length > 0;
            const minSpend = hasGifts
              ? Math.min(...p.gifts.map((g) => g.fullAmount))
              : 0;
            const giftNames = hasGifts
              ? [
                ...new Set(
                  p.gifts.map(
                    (g) =>
                      `${g.productName} × ${g.quantity === -1 ? 1 : g.quantity}`,
                  ),
                ),
              ]
              : [];
            const TAG_TYPES = ['new', 'promo', 'premium'] as const;
            const COLOR_SCHEMES = [
              'forest',
              'burgundy',
              'navy',
              'bronze',
              'plum',
              'slate',
            ] as const;
            const id = Math.abs(p.id ?? i);
            const tagIdx = id % TAG_TYPES.length;
            const colorIdx = id % COLOR_SCHEMES.length;
            const lName = localName(p);
            return {
              name: p.name,
              nameJP: p.nameJP || p.name,
              nameKR: p.nameKR || p.name,
              tag: '期間限定',
              tagType: TAG_TYPES[tagIdx],
              colorScheme: COLOR_SCHEMES[colorIdx],
              image: `${this.apiService.getPromotionImageUrl(p.id)}?v=${p.id}-${p.startTime}-${p.endTime}`,
              startDate: p.startTime,
              endDate: p.endTime,
              minSpend,
              gifts: giftNames,
              giftsJP: giftNames,
              giftsKR: giftNames,
              description:
                p.description ||
                (hasGifts
                  ? `消費滿 $${minSpend} 即可獲得贈品，把握活動期間限定好禮！`
                  : '期間限定活動，敬請把握！'),
              descriptionJP:
                p.description ||
                (hasGifts
                  ? `$${minSpend}以上のご購入でプレゼント！期間限定をお見逃しなく。`
                  : '期間限定イベント、お見逃しなく！'),
              descriptionKR:
                p.description ||
                (hasGifts
                  ? `$${minSpend} 이상 구매 시 선물 증정！기간 한정 혜택을 놓치지 마세요。`
                  : '기간 한정 이벤트, 놓치지 마세요！'),
              highlights: hasGifts
                ? [
                  `消費滿 $${minSpend}`,
                  '可選贈品',
                  `${p.startTime} ～ ${p.endTime}`,
                ]
                : [`${p.startTime} ～ ${p.endTime}`],
              highlightsJP: hasGifts
                ? [
                  `$${minSpend}以上のご購入`,
                  'プレゼントをお選びください',
                  `${p.startTime} ～ ${p.endTime}`,
                ]
                : [`${p.startTime} ～ ${p.endTime}`],
              highlightsKR: hasGifts
                ? [
                  `$${minSpend} 이상 구매`,
                  '선물 선택 가능',
                  `${p.startTime} ～ ${p.endTime}`,
                ]
                : [`${p.startTime} ～ ${p.endTime}`],
            };
          },
        );
      },
      error: () => {
        /* API 失敗時保留靜態 Demo 資料 */
      },
    });
  }

  private _syncQueue: Promise<void> = Promise.resolve();

  private _syncCartItemToBackend(productId: number, quantity: number): void {
    this._syncQueue = this._syncQueue
      .then(async () => {
        const user = this.authService.currentUser;
        const memberId = user?.isGuest ? 1 : (user?.id ?? 1);
        const req: CartSyncReq = {
          cartId: this.currentCartId() || null,
          globalAreaId: this.branchService.globalAreaId,
          productId,
          quantity,
          operationType: 'CUSTOMER',
          memberId,
        };
        const res = await firstValueFrom(this.apiService.syncCart(req));
        if (res.cartId && res.cartId > 0) {
          this.currentCartId.set(res.cartId || null);
          localStorage.setItem('lbb_cart_id', String(res.cartId));
        }
      })
      .catch((err) => console.warn('[Cart] sync 失敗', err));
  }

  /* ── 更新購物車數量 ──────────────────────────────── */
  updateCartQuantity(id: number, delta: number): void {
    const current = this.cartItems();
    const item = current.find((c) => c.id === id);
    if (!item) return;
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      this.cartItems.set(current.filter((c) => c.id !== id));
      // 以 quantity=0 呼叫 sync 端點，後端不支援 DELETE /cart/item
      this._syncCartItemToBackend(id, 0);
    } else {
      this.cartItems.set(
        current.map((c) => (c.id === id ? { ...c, quantity: newQty } : c)),
      );
      this._syncCartItemToBackend(id, newQty);
    }
  }

  /* ── 從購物車移除 ─────────────────────────────────── */
  removeFromCart(id: number): void {
    // 以 quantity=0 呼叫 sync 端點，後端不支援 DELETE /cart/item
    this._syncCartItemToBackend(id, 0);
    this.cartItems.set(this.cartItems().filter((c) => c.id !== id));
  }

  /* ── 清空購物車（同步後端，用於取消訂單）──────────── */
  clearCart(): void {
    const cartId = this.currentCartId();
    /* 先清本地狀態，避免任何 API 錯誤影響 UI */
    this.currentCartId.set(null);
    this.cartItems.set([]);
    localStorage.removeItem('lbb_cart_id');

    if (cartId !== null) {
      const user = this.authService.currentUser;
      const memberId = user?.isGuest ? 1 : (user?.id ?? 1);
      this.apiService.clearCart({ cartId, memberId }).subscribe({
        /* 400 "Cart Already Checked Out" 視為成功：靜默忽略 */
        error: () => { },
      });
    }
  }

  /* ── 訂單成功後重置本地購物車（不刪後端明細，保留訂單歷史）── */
  private resetLocalCart(): void {
    this.cartItems.set([]);
    this.currentCartId.set(null);
    localStorage.removeItem('lbb_cart_id');
  }

  /* ── 前往結帳 ─────────────────────────────────────── */
  goToCheckout(): void {
    this.activeTab.set('checkout');
  }

  /* ── 送出訂單（完整流程）────────────────────────────
   * 1. 顯示「處理中」spinner（isPlacingOrder = true）
   * 2. 模擬後端處理延遲 1.2 秒
   * 3. 建立 LiveOrder 並推送至 OrderService（POS 看板即時同步）
   * 4. 新增至本地歷史訂單清單
   * 5. 清空購物車
   * 6. 導向訂單追蹤頁
   * ────────────────────────────────────────────────── */
  placeOrder(): void {
    if (!this.pendingOrderId()) return;
    if (this.isPlacingOrder()) return;
    this.isPlacingOrder.set(true);

    setTimeout(() => {
      this._doPlaceOrderAsync()
        .catch((err) => {
          console.error('[Order] 下單失敗', err);
          const msg: string = err?.error?.message ?? err?.message ?? '';
          if (msg.includes('逾時') || msg.includes('登入')) {
            alert('登入連線已逾時，請重新登入後再結帳');
            this.authService.logout();
            this.router.navigate(['/customer-login']);
          } else {
            alert('結帳失敗，請稍後再試');
          }
        })
        .finally(() => {
          /* LINE Pay：QR Modal 顯示中，isPlacingOrder 保持 true 直到 cancelLinePayQr() */
          if (this.paymentMethod() !== 'linepay') {
            this.isPlacingOrder.set(false);
          }
        });
    }, 1200);
  }

  private async _doPlaceOrderAsync(): Promise<void> {
    const orderId = this.pendingOrderId()!;
    const orderDateId = this.pendingOrderDateId();

    /* ── 現金：直接進入待付款追蹤 ── */
    if (this.paymentMethod() === 'cash') {
      this._afterOrderSuccess(orderId, orderDateId, 'waiting', true);
      return;
    }

    /* ── LINE Pay：取得付款 URL 後轉成 QR Code 顯示 ── */
    if (this.paymentMethod() === 'linepay') {
      const url = await firstValueFrom(
        this.apiService.getLinePayUrl({ id: orderId, orderDateId }),
      );
      this.linePayQrUrl.set(url);
      this.linePayPollOrderId.set(orderId);
      this.linePayPollOrderDateId.set(orderDateId);
      this._startLinePayPoll(orderId, orderDateId);
      return;
    }

    /* ── ECPay：後端回傳 HTML 表單，注入 DOM 後手動呼叫 submit() ── */
    if (this.paymentMethod() === 'ecpay') {
      const html = await firstValueFrom(
        this.apiService.getEcpayForm({ id: orderId, orderDateId }),
      );
      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container);
      const formEl = container.querySelector('form') as HTMLFormElement | null;
      if (formEl) formEl.submit();
      return;
    }
  }

  private _afterOrderSuccess(
    orderId: string,
    orderDateId: string = '',
    initialStatus: OrderStatus = 'waiting',
    isCash = false,
  ): void {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const orderNum = `${orderDateId}-${orderId}`;
    const trackId = orderDateId ? `DB-${orderDateId}-${orderId}` : orderId;
    const itemTexts = this.cartItems().map((i) => `${i.name} × ${i.quantity}`);
    const promoGift = this.selectedPromoGift();
    const promoName = this.selectedPromoName();
    if (promoGift && promoName && promoName !== '不參加活動優惠') {
      itemTexts.push(`${promoName} - ${promoGift}`);
    }
    const totalQty = this.cartItems().reduce((s, i) => s + i.quantity, 0);
    const estMin = Math.max(5, Math.ceil(totalQty * 2));

    const payLabels: Record<string, string> = {
      credit: '信用卡',
      mobile: '行動支付',
      cash: '現金',
    };
    const payLabel = payLabels[this.paymentMethod()] ?? '現金';

    /* 推送至 POS 看板（本機 in-memory，同視窗時即時同步） */
    const orderUser = this.authService.currentUser;
    this.orderService.addOrder({
      id: trackId,
      number: orderNum,
      status: initialStatus,
      estimatedMinutes: estMin,
      items: itemTexts,
      total: this.cartTotal(),
      createdAt: timeStr,
      payMethod: payLabel,
      source: 'customer',
      customerName: orderUser?.name,
      orderType: orderUser?.isGuest ? '訪客' : '會員',
      isCash,
    });

    // 寫入 localStorage，頁面重整後可重建追蹤狀態
    localStorage.setItem(
      'lbb_tracking_order',
      JSON.stringify({
        orderId: trackId,
        orderDateId,
        number: orderNum,
        status: initialStatus,
        estimatedMinutes: estMin,
        items: itemTexts,
        total: this.cartTotal(),
        createdAt: timeStr,
        payMethod: payLabel,
        isCash,
      }),
    );

    /* 儲存 DB 訂單識別碼，啟動廚房狀態輪詢（跨裝置同步） */
    if (orderDateId) {
      this._activeOrderDbId = { id: orderId, orderDateId };
      const existingIv = this.statusPollIntervals.get(trackId);
      if (existingIv) { clearInterval(existingIv); this.statusPollIntervals.delete(trackId); }
      this.statusPollIntervals.set(trackId, setInterval(() => {
        this.apiService
          .getOrderStatus(orderId, orderDateId)
          .subscribe({
            next: (res) => {
              if (res?.code !== 200) return;
              const statusMap: Record<string, OrderStatus> = isCash
                ? {
                  PREPARING: 'waiting',
                  PENDING_CASH: 'waiting',
                  WAITING: 'waiting',
                  COOKING: 'cooking',
                  READY: 'ready',
                  AWAITING_PAYMENT: 'pending-cash',
                  PICKED_UP: 'paid',
                  COMPLETED: 'paid',
                }
                : {
                  PREPARING: 'waiting',
                  WAITING: 'waiting',
                  COOKING: 'cooking',
                  READY: 'done',
                  PICKED_UP: 'done',
                  COMPLETED: 'done',
                };
              const current = this.orderService
                .orders()
                .find((o) => o.id === trackId);
              /* 已達終態時停止輪詢（現金=paid，非現金=done） */
              const endStatus: OrderStatus = isCash ? 'paid' : 'done';
              if (current?.status === endStatus || current?.status === 'paid') {
                const iv2 = this.statusPollIntervals.get(trackId);
                if (iv2) { clearInterval(iv2); this.statusPollIntervals.delete(trackId); }
                this._scheduleOrderCompletion(trackId);
                return;
              }
              const newStatus =
                statusMap[res.message] ?? current?.status ?? 'waiting';
              if (current && current.status !== newStatus) {
                this.orderService.updateStatus(trackId, newStatus);
              }

              // 同步 activeOrders 顯示狀態
              const aoStatus =
                newStatus === 'waiting'
                  ? 'cooking'
                  : newStatus === 'cooking'
                    ? 'cooking'
                    : newStatus === 'ready'
                      ? 'ready'
                      : 'done';
              this.activeOrders.set(
                this.activeOrders().map((o) =>
                  o.id === trackId
                    ? { ...o, status: aoStatus as ActiveOrder['status'] }
                    : o,
                ),
              );

              if (newStatus === endStatus) {
                const iv2 = this.statusPollIntervals.get(trackId);
                if (iv2) { clearInterval(iv2); this.statusPollIntervals.delete(trackId); }
                /* 顯示「取餐完畢」7 秒後移除 */
                this._scheduleOrderCompletion(trackId);
              }
            },
            error: () => {
              /* 靜默失敗 */
            },
          });
      }, 5000));
    }

    /* 加入本地歷史訂單 */
    /* 加入未完成訂單列表 */
    this.activeOrders.set([
      {
        id: trackId,
        number: orderNum,
        status: 'cooking',
        items: itemTexts,
        total: this.discountedTotal(),
        createdAt: timeStr,
        payMethod: payLabel,
        isCash,
        estimatedMinutes: estMin,
      },
      ...this.activeOrders(),
    ]);

    const usedCoupon = this.useDiscountCoupon();
    this.resetLocalCart();
    this.orderNote.set('');

    if (usedCoupon) {
      this.memberOrderCount.set(0);
      this.memberHasDiscount.set(false);
      this.useDiscountCoupon.set(false);
      if (this.authService.currentMember) {
        this.authService.currentMember.orderCount = 0;
        this.authService.currentMember.isDiscount = false;
        if (this.authService.currentMember.members) {
          this.authService.currentMember.members.orderCount = 0;
          this.authService.currentMember.members.discount = false;
        }
        sessionStorage.setItem('currentMember', JSON.stringify(this.authService.currentMember));
      }
    } else {
      this.memberOrderCount.update((c) => Math.min(c + 1, this.discountThreshold()));
      const n = this.discountThreshold();
      if (n > 0 && this.memberOrderCount() >= n) {
        this.memberHasDiscount.set(true);
      }
      if (this.authService.currentMember) {
        const rawNew = (this.authService.currentMember.orderCount ?? 0) + 1;
        this.authService.currentMember.orderCount = rawNew;
        sessionStorage.setItem('currentMember', JSON.stringify(this.authService.currentMember));
      }
    }

    this.selectedPromoName.set('');
    this.selectedPromoGift.set('');
    this.promoGiftPanelOpen.set(false);
    this.isPlacingOrder.set(false);

    const isGuest = this.authService.currentUser?.isGuest === true;
    if (isGuest) {
      const gAreaId = this.branchService.globalAreaId;
      const branch = this.branchService.currentBranches.find(
        (b) => b.id === gAreaId,
      );
      this.guestSuccessPhone.set(this.phoneToIntl(this.phoneNumber()));
      this.guestSuccessBranchName.set(
        branch ? this.branchService.getLocalizedBranchName(branch) : '所選分店',
      );
      this.guestSuccessModalOpen.set(true);
    } else {
      this.setTab('orders');
      this.activeOrderTab.set('active');
    }
  }

  closeGuestSuccessModal(): void {
    this.guestSuccessModalOpen.set(false);
    this.setTab('home');
  }

  /* ── 取得頭像文字 ────────────────────────────────── */
  getAvatarLetter(): string {
    const user = this.authService.currentUser;
    if (!user) return '?';
    if (user.isGuest) return 'G';
    return user.name?.charAt(0) ?? '?';
  }

  /* ── 登出 ─────────────────────────────────────────── */
  logout(): void {
    this.authService.logout();
    this.router.navigate(['/customer-login']);
  }

  /* ── Session 過期：導向重新登入 ──────────────────── */
  goToLogin(): void {
    this.authService.clearSessionExpired();
    this.router.navigate(['/customer-login']);
  }
}
