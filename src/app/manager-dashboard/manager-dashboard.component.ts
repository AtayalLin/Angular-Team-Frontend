/*
 * =====================================================
 * 檔案名稱：manager-dashboard.component.ts
 * 位置說明：src/app/manager-dashboard/manager-dashboard.component.ts
 * 用途說明：老闆（boss）後台管理主控台
 * 功能說明：
 *   - 側邊欄 7 個頁籤切換（帳號管理 / 分店管理 / 國家基本設定 / 會員設定 / 商品管理 / 活動管理 / 財務報表）
 *   - 帳號管理：依角色分頁（分店長 / 副店長 / 員工）、依分店篩選、國家與分店排序
 *   - 帳號操作：新增帳號、停權 / 復權、重設密碼、升降職、調換分店
 *   - 分店管理：新增 / 編輯 / 刪除分店
 *   - 國家基本設定：稅率維護與即時匯率查詢
 *   - 會員設定：各國折扣上限與累積次數設定
 *   - 商品管理：商品新增 / 編輯 / 刪除、上下架、分類與風格管理
 *   - 活動管理：活動新增 / 編輯 / 刪除、啟用 / 停用、贈品門檻設定
 *   - 財務報表：月報表 / 區間查詢 / 匯率換算
 *   - 登入保護：非 boss 角色自動導回 staff-login
 *   - 即時時鐘顯示
 * =====================================================
 */

import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { forkJoin } from 'rxjs';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../shared/auth.service';
import {
  ApiService,
  GlobalAreaVO,
  RegionVO,
  PromotionDetailVo,
  GiftDetailVo,
  ProductAdminVo,
  StaffVO,
  UpdatePromotionInfoReq,
  ExchangeRateVO,
  AiRes,
  PromotionsManageReq,
  DiscountRecord,
  DiscountReq,
  MonthlyReportRes,
  MonthRangeReportsRes,
  RevenueQueryRes,
} from '../shared/api.service';


/* ── 側邊欄頁籤型別 ─────────────────────────────────── */
export type DashTab =
  | 'products'
  | 'promotions'
  | 'users'
  | 'tax'
  | 'finance'
  | 'branches'
  | 'member';

/* ── 帳號管理子頁籤型別 ─────────────────────────────── */
export type UserSubTab = 'bm' | 'ma' | 'staff';

/* ── 商品型別 ──────────────────────────────────────── */
interface DashProduct {
  id: number;
  name: string;
  category: string;
  style: string;
  description?: string;
  isActive: boolean;
  foodImgBase64: string;
}

/* ── 活動型別 ──────────────────────────────────────── */
interface DashPromo {
  id: number;
  title: string;
  scope: string;
  isActive: boolean;
  color: string;
  ended: boolean;
  rawName: string; /* API 原始名稱，toggle 時帶回後端（@NotBlank 需要）*/
  rawStartTime: string; /* YYYY-MM-DD，toggle 時帶回後端（@NotNull 需要）*/
  rawEndTime: string; /* YYYY-MM-DD，toggle 時帶回後端（@NotNull 需要）*/
  type: 'promotion' | 'announcement';
  description?: string;
  image?: string;
  badgeColor?: string;
  gifts?: GiftDetailVo[];
}

/* ── 帳號型別 ──────────────────────────────────────── */
interface DashAccount {
  id: number;
  name: string;
  account: string;
  branch?: string;
  shift?: string;
  joinedAt: string;
  isActive: boolean;
  role: 'bm' | 'ma' | 'staff';
  backendRole?: string; // ← 加這行
  country?: string;
}

/* ── 分店型別（對應 global_area 資料表）───────────── */
interface DashBranch {
  id: number;
  name: string;      /* 分店名稱，對應 global_area.branch */
  country: string;   /* 國家，透過 regionsId 對應 regions / taxes */
  regionsId: number; /* 對應 global_area.regions_id */
  address: string;   /* 對應 global_area.address */
  phone: string;     /* 對應 global_area.phone */
}

/* ── 稅率型別 ──────────────────────────────────────── */
interface DashTax {
  id: number;
  country: string;
  countryCode: string;
  currency: string;
  taxType: string;
  rate: number;
  discountLimit: number;
  editing: boolean;
  editRate: number;
  editTaxType: string;
  editDiscountLimit: number;
}

type FinanceMode = 'month' | 'monthRange' | 'dateRange';

interface FinanceDisplayRow {
  branchName: string;
  regionsName: string;
  currentAmount: number;
  lastAmount?: number;
  currentCost: number;
  growth?: number;
}

interface FinanceChartRow {
  label: string;
  revenue: number;
  cost: number;
}

@Component({
  selector: 'app-manager-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manager-dashboard.component.html',
  styleUrls: ['./manager-dashboard.component.scss'],
})
export class ManagerDashboardComponent implements OnInit, OnDestroy {
  /* ── 頁籤狀態 ──────────────────────────────────── */
  /* 預設頁籤：帳號管理 */
  activeTab = signal<DashTab>('users');
  userSubTab = signal<UserSubTab>('bm');
  clockStr = signal('');

  /* ── 頁籤標題 ──────────────────────────────────── */
  readonly TAB_TITLES: Record<DashTab, string> = {
    products: '🛍️ 商品管理',
    promotions: '🎯 活動管理',
    users: '👥 帳號管理',
    tax: '🌍 國家基本設定',
    finance: '💰 財務報表',
    branches: '🏪 分店管理',
    member: '🎁 會員設定',
  };
  /* ── 商品清單（Signal） ─────────────────────────── */
  products = signal<DashProduct[]>([]);
  trashProducts = signal<DashProduct[]>([]);
  showTrash = signal(false);

  /* ── 活動清單（Signal） ─────────────────────────── */
  promos = signal<DashPromo[]>([]);

  /* ── 折抵清單（Signal） ─────────────────────────── */
  discounts = signal<DiscountRecord[]>([]);
  discountLoading = signal(false);
  editingDiscountId = signal<number | null>(null);
  editDiscountCap = signal(0);
  editDiscountCount = signal(0);

  /* ── 會員設定：合併 taxes + discounts ───────────── */
  /** 會員設定列表：以 discount 資料表為主，只顯示已建立優惠設定的國家 */
  memberData = computed(() =>
    this.discounts()
      .map((disc) => {
        const tax = this.taxes().find((t) => t.id === disc.regionsId);
        if (!tax) return null;

        return { tax, disc };
      })
      .filter((row): row is { tax: DashTax; disc: DiscountRecord } => row !== null),
  );
  editingMemberRegionId = signal<number | null>(null);
  editMemberLimit = signal(0);
  editMemberCap = signal(0);

  /** 新增會員設定下拉：只顯示尚未建立 discount 記錄的國家 */
  availableMemberLimitCountries = computed(() => {
    const existingRegionIds = new Set(
      this.discounts()
        .map((d) => d.regionsId)
        .filter((id): id is number => typeof id === 'number' && id > 0),
    );

    return this.taxes().filter((tax) => !existingRegionIds.has(tax.id));
  });

  /* ── 帳號清單（Signal） ─────────────────────────── */
  accounts = signal<DashAccount[]>([

  ]);

  /* ── 帳號管理：角色分頁、分店篩選與排序 ─────────────── */

  /** 國家排序權重：常用市場優先，其餘國家再依名稱排序 */
  private getCountrySortWeight(country?: string): number {
    const order = ['台灣', '日本', '韓國', '泰國', '新加坡'];
    const index = order.indexOf(country || '');
    return index === -1 ? 999 : index;
  }

  /** 共用國家排序：確保下拉選單、帳號表格、缺職位提醒順序一致 */
  private compareCountry(aCountry?: string, bCountry?: string): number {
    const weightA = this.getCountrySortWeight(aCountry);
    const weightB = this.getCountrySortWeight(bCountry);

    if (weightA !== weightB) return weightA - weightB;

    return (aCountry || '').localeCompare(bCountry || '', 'zh-Hant');
  }

  /** 共用分店排序：國家 → 分店名稱 */
  private compareBranches(a: DashBranch, b: DashBranch): number {
    const countryCompare = this.compareCountry(a.country, b.country);
    if (countryCompare !== 0) return countryCompare;

    return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
  }

  /** 帳號列表頁目前選擇的分店；空字串代表全部分店 */
  accountBranchFilter = signal<string>('');

  /** 依角色分出三個子頁籤資料：分店長 */
  bmAccounts = computed(() =>
    this.accounts()
      .filter((a) => a.role === 'bm')
      .sort((a, b) => this.sortAccountsByCountryBranch(a, b)),
  );

  /** 依角色分出三個子頁籤資料：副店長 */
  maAccounts = computed(() =>
    this.accounts()
      .filter((a) => a.role === 'ma')
      .sort((a, b) => this.sortAccountsByCountryBranch(a, b)),
  );

  /** 依角色分出三個子頁籤資料：員工 */
  staffAccounts = computed(() =>
    this.accounts()
      .filter((a) => a.role === 'staff')
      .sort((a, b) => this.sortAccountsByCountryBranch(a, b)),
  );

  /** 分店篩選條件：未選分店時顯示全部 */
  private matchAccountBranch(acc: DashAccount): boolean {
    const branch = this.accountBranchFilter();
    return branch === '' || acc.branch === branch;
  }

  /** 分店長列表實際顯示資料 */
  filteredBmAccounts = computed(() =>
    this.bmAccounts()
      .filter((a) => this.matchAccountBranch(a))
      .sort((a, b) => this.sortAccountsByCountryBranch(a, b)),
  );

  /** 副店長列表實際顯示資料 */
  filteredMaAccounts = computed(() =>
    this.maAccounts()
      .filter((a) => this.matchAccountBranch(a))
      .sort((a, b) => this.sortAccountsByCountryBranch(a, b)),
  );

  /** 員工列表實際顯示資料 */
  filteredStaffAccounts = computed(() =>
    this.staffAccounts()
      .filter((a) => this.matchAccountBranch(a))
      .sort((a, b) => this.sortAccountsByCountryBranch(a, b)),
  );

  /** 分店下拉 / modal / 表格共用排序：國家 → 分店名稱 */
  sortedBranches = computed(() =>
    [...this.branches()].sort((a, b) => this.compareBranches(a, b)),
  );

  /** 分店管理表格顯示資料：沿用國家 / 分店名稱排序 */
  branchRows = computed(() => this.sortedBranches());

  /** 快速重置：回到全部分店 */
  resetAccountBranchFilter(): void {
    this.accountBranchFilter.set('');
  }

  /** 顯示角色中文 */
  getRoleLabel(role: 'bm' | 'ma' | 'staff' = this.accountDraft.role): string {
    if (role === 'bm') return '分店長';
    if (role === 'ma') return '副店長';
    return '員工';
  }

  /** 某分店是否已經有指定職位 */
  private hasRoleInBranch(branchName: string, role: 'bm' | 'ma' | 'staff'): boolean {
    return this.accounts().some((a) => a.branch === branchName && a.role === role);
  }

  /**
   * 新增帳號 modal 使用：
   * 依目前 accountDraft.role 找出「尚未有此職位」的分店，並依國家分組。
   */
  getMissingRoleBranchGroups(role: 'bm' | 'ma' | 'staff' = this.accountDraft.role): {
    country: string;
    branches: DashBranch[];
  }[] {
    const missingBranches = this.sortedBranches().filter(
      (b) => !this.hasRoleInBranch(b.name, role),
    );

    const groups = new Map<string, DashBranch[]>();

    missingBranches.forEach((b) => {
      const country = b.country || '未分類國家';
      const list = groups.get(country) ?? [];
      list.push(b);
      groups.set(country, list);
    });

    return Array.from(groups.entries()).map(([country, branches]) => ({
      country,
      branches,
    }));
  }

  /** 指定職位總共有幾間分店尚未配置 */
  getMissingRoleBranchCount(role: 'bm' | 'ma' | 'staff' = this.accountDraft.role): number {
    return this.getMissingRoleBranchGroups(role).reduce(
      (sum, group) => sum + group.branches.length,
      0,
    );
  }

  private resolveAccountRole(
    account: string,
    backendRole?: string,
  ): 'bm' | 'ma' | 'staff' {
    if (backendRole === 'REGION_MANAGER') return 'bm';
    if (backendRole === 'MANAGER_AGENT') return 'ma';
    if (backendRole === 'STAFF') return 'staff';

    const prefix = account.trim().slice(0, 2).toUpperCase();
    if (prefix === 'RM') return 'bm';
    if (prefix === 'MA') return 'ma';
    return 'staff';
  }

  /* ── 帳號管理 computed ──────────────────────────── */
  uniqueCountries = computed(() =>
    [
      ...new Set(
        this.branches()
          .map((b) => b.country)
          .filter(Boolean),
      ),
    ].sort((a, b) => this.compareCountry(a, b)),
  );

  accountModalCountry = signal('');

  filteredAccountBranches = computed(() => {
    const c = this.accountModalCountry();

    return this.sortedBranches().filter((b) => {
      if (!c) return true;
      return b.country === c;
    });
  });

  /* ── 財務報表：重建版狀態 ─────────────────────────── */


  financeMode = signal<FinanceMode>('month');
  financeCountry = signal<string>('全部');
  financeBranchName = signal<string>('');

  financeMonth = signal<string>('2026-05');
  financeStartMonth = signal<string>('2025-12');
  financeEndMonth = signal<string>('2026-05');

  financeStartDate = signal<string>('2026-05-01');
  financeEndDate = signal<string>('2026-05-31');

  financeLoading = signal(false);
  financeError = signal<string>('');

  showFinanceTwdConversion = signal(false);

  readonly FINANCE_CONVERTIBLE_CURRENCIES = ['JPY', 'KRW'];

  financeMonthlyResult = signal<MonthlyReportRes | null>(null);
  financeMonthRangeResult = signal<MonthRangeReportsRes | null>(null);
  financeRevenueResult = signal<RevenueQueryRes | null>(null);

  /** 財報國家下拉：從國家設定 taxes() 取得 */
  financeCountries = computed(() => this.taxes().map((t) => t.country));

  /** 財報分店下拉：國家選全部時顯示全部，選特定國家時只顯示該國分店 */
  financeBranchOptions = computed(() => {
    const country = this.financeCountry();

    if (country === '全部') {
      return this.sortedBranches();
    }

    return this.sortedBranches().filter((b) => b.country === country);
  });

  /** 目前選到的分店 */
  selectedFinanceBranch = computed(() => {
    const name = this.financeBranchName();
    if (!name) return null;

    return this.branches().find((b) => b.name === name) ?? null;
  });

  /** 實際查詢 / 顯示使用的國家：有選分店時，以分店國家為準 */
  effectiveFinanceCountry = computed(() => {
    const branch = this.selectedFinanceBranch();
    if (branch) return branch.country;

    return this.financeCountry();
  });

  /** 後端 getRevenueReports 只吃 regionsId，不吃 branchId */
  financeRegionsId = computed<number | undefined>(() => {
    const country = this.effectiveFinanceCountry();
    if (country === '全部') return undefined;

    return this.taxes().find((t) => t.country === country)?.id;
  });

  /** 財報目前顯示幣別 */
  financeCurrency = computed(() => {
    const country = this.effectiveFinanceCountry();

    if (country === '全部') return 'TWD';

    return this.taxes().find((t) => t.country === country)?.currency || '';
  });

  canConvertFinanceToTwd = computed(() => {
    const country = this.effectiveFinanceCountry();

    if (country === '全部') return false;

    return this.FINANCE_CONVERTIBLE_CURRENCIES.includes(this.financeCurrency());
  });

  financeDisplayCurrency = computed(() => {
    if (this.showFinanceTwdConversion() && this.canConvertFinanceToTwd()) {
      return 'TWD';
    }

    return this.financeCurrency();
  });

  /** 選國家時，若目前分店不屬於該國，清掉分店 */
  onFinanceCountryChange(country: string): void {
    this.financeCountry.set(country);
    this.showFinanceTwdConversion.set(false);

    const branch = this.selectedFinanceBranch();
    if (country !== '全部' && branch && branch.country !== country) {
      this.financeBranchName.set('');
    }

    this.clearFinanceResults();
  }

  /** 選分店時，自動帶入分店所屬國家 */
  onFinanceBranchChange(branchName: string): void {
    this.financeBranchName.set(branchName);
    this.showFinanceTwdConversion.set(false);

    const branch = this.branches().find((b) => b.name === branchName);
    if (branch) {
      this.financeCountry.set(branch.country);
    }

    this.clearFinanceResults();
  }

  /** 切換報表類型時清掉舊結果，避免資料混在一起 */
  onFinanceModeChange(mode: FinanceMode): void {
    this.financeMode.set(mode);
    this.showFinanceTwdConversion.set(false);
    this.clearFinanceResults();
  }

  private clearFinanceResults(): void {
    this.financeError.set('');
    this.financeMonthlyResult.set(null);
    this.financeMonthRangeResult.set(null);
    this.financeRevenueResult.set(null);
  }

  resetFinanceFilters(): void {
    this.financeMode.set('month');
    this.financeCountry.set('全部');
    this.financeBranchName.set('');
    this.financeMonth.set('2026-05');
    this.financeStartMonth.set('2025-12');
    this.financeEndMonth.set('2026-05');
    this.financeStartDate.set('2026-05-01');
    this.financeEndDate.set('2026-05-31');
    this.showFinanceTwdConversion.set(false);
    this.clearFinanceResults();
  }

  queryFinanceReport(): void {
    this.financeError.set('');

    if (this.financeMode() === 'month') {
      this.queryFinanceMonthly();
      return;
    }

    if (this.financeMode() === 'monthRange') {
      this.queryFinanceMonthRange();
      return;
    }

    this.queryFinanceDateRange();
  }

  private queryFinanceMonthly(): void {
    const reportDate = this.financeMonth();

    if (!reportDate) {
      this.showToast('⚠️ 請選擇查詢月份');
      return;
    }

    this.financeLoading.set(true);
    this.clearFinanceResults();

    this.apiService.getMonthlyReport({ reportDate }).subscribe({
      next: (res) => {
        this.financeLoading.set(false);

        if (!this.isSuccessRes(res)) {
          this.financeError.set(this.getApiErrorMessage(res, '查無月報表資料'));
          return;
        }

        this.financeMonthlyResult.set(res);
      },
      error: () => {
        this.financeLoading.set(false);
        this.financeError.set('月報表載入失敗，請確認後端連線');
      },
    });
  }

  private queryFinanceMonthRange(): void {
    const startMonth = this.financeStartMonth();
    const endMonth = this.financeEndMonth();

    if (!startMonth || !endMonth) {
      this.showToast('⚠️ 請選擇月份區間');
      return;
    }

    if (startMonth > endMonth) {
      this.showToast('⚠️ 開始月份不能晚於結束月份');
      return;
    }

    this.financeLoading.set(true);
    this.clearFinanceResults();

    this.apiService
      .getMonthlyReportByRange({
        startMonth,
        endMonth,
      })
      .subscribe({
        next: (res) => {
          this.financeLoading.set(false);

          if (!this.isSuccessRes(res)) {
            this.financeError.set(this.getApiErrorMessage(res, '查無月份區間報表資料'));
            return;
          }

          this.financeMonthRangeResult.set(res);
        },
        error: () => {
          this.financeLoading.set(false);
          this.financeError.set('月份區間報表載入失敗，請確認後端連線');
        },
      });
  }

  private queryFinanceDateRange(): void {
    const startDate = this.financeStartDate();
    const endDate = this.financeEndDate();

    if (!startDate || !endDate) {
      this.showToast('⚠️ 請選擇日期區間');
      return;
    }

    if (startDate > endDate) {
      this.showToast('⚠️ 開始日期不能晚於結束日期');
      return;
    }

    this.financeLoading.set(true);
    this.clearFinanceResults();

    this.apiService
      .getRevenueReports({
        startDate,
        endDate,
        regionsId: this.financeRegionsId(),
      })
      .subscribe({
        next: (res) => {
          this.financeLoading.set(false);

          if (!this.isSuccessRes(res)) {
            this.financeError.set(this.getApiErrorMessage(res, '查無日期區間報表資料'));
            return;
          }

          this.financeRevenueResult.set(res);
        },
        error: () => {
          this.financeLoading.set(false);
          this.financeError.set('日期區間報表載入失敗，請確認後端連線');
        },
      });
  }

  private matchFinanceRow(row: { branchName: string; regionsName: string }): boolean {
    const country = this.effectiveFinanceCountry();
    const branchName = this.financeBranchName();

    if (country !== '全部' && row.regionsName !== country) {
      return false;
    }

    if (branchName && row.branchName !== branchName) {
      return false;
    }

    return true;
  }

  financeCurrencyByCountry(country: string): string {
    return this.taxes().find((t) => t.country === country)?.currency || 'TWD';
  }

  private getRateToTwdByCurrency(currency: string): number {
    if (!currency || currency === 'TWD') return 1;

    const rate = this.allRates().find((r) => r.currencyCode === currency)?.rateToTwd ?? 0;

    // rateToTwd = 1 TWD 可換多少外幣，所以外幣轉 TWD 要除以 rate
    return rate > 0 ? 1 / rate : 0;
  }

  private getRateToTwdByCountry(country: string): number {
    const currency = this.financeCurrencyByCountry(country);
    return this.getRateToTwdByCurrency(currency);
  }

  private convertFinanceAmountIfNeeded(amount: number, country: string): number {
    const value = Number(amount || 0);

    if (!this.showFinanceTwdConversion() || !this.canConvertFinanceToTwd()) {
      return value;
    }

    const rate = this.getRateToTwdByCountry(country);
    return rate > 0 ? value * rate : value;
  }

  toggleFinanceTwdConversion(): void {
    if (!this.canConvertFinanceToTwd()) return;

    this.showFinanceTwdConversion.update((v) => !v);
  }

  /**
   * 財報金額顯示：
   * - 選「全部」時，不做跨幣別加總，不轉換。
   * - 選日本 / 韓國且開啟台幣換算時，才轉為 TWD。
   * - 其他情況保留原幣別。
   */
  private normalizeFinanceAmount(amount: number, country: string): number {
    return this.convertFinanceAmountIfNeeded(amount, country);
  }

  private calcGrowth(current: number, last: number): number {
    if (!last) return 0;
    return ((current - last) / last) * 100;
  }

  financeDisplayRows = computed<FinanceDisplayRow[]>(() => {
    const mode = this.financeMode();

    if (mode === 'month') {
      const result = this.financeMonthlyResult();
      if (!result) return [];

      const currentRows = (result.currentData ?? []).filter((r) =>
        this.matchFinanceRow(r),
      );

      const lastRows = (result.lastData ?? []).filter((r) =>
        this.matchFinanceRow(r),
      );

      const lastMap = new Map(lastRows.map((r) => [r.branchName, r]));

      return currentRows.map((row) => {
        const last = lastMap.get(row.branchName);
        const currentAmount = this.normalizeFinanceAmount(row.totalAmount, row.regionsName);
        const lastAmount = last
          ? this.normalizeFinanceAmount(last.totalAmount, last.regionsName)
          : 0;
        const currentCost = this.normalizeFinanceAmount(row.totalCost, row.regionsName);

        return {
          branchName: row.branchName,
          regionsName: row.regionsName,
          currentAmount,
          lastAmount,
          currentCost,
          growth: this.calcGrowth(currentAmount, lastAmount),
        };
      });
    }

    if (mode === 'monthRange') {
      const result = this.financeMonthRangeResult();
      if (!result) return [];

      const map = new Map<string, FinanceDisplayRow>();

      (result.reportList ?? [])
        .filter((r) => this.matchFinanceRow(r))
        .forEach((row) => {
          const key = `${row.regionsName}-${row.branchName}`;
          const prev = map.get(key) ?? {
            branchName: row.branchName,
            regionsName: row.regionsName,
            currentAmount: 0,
            currentCost: 0,
          };

          map.set(key, {
            ...prev,
            currentAmount:
              prev.currentAmount +
              this.normalizeFinanceAmount(row.totalAmount, row.regionsName),
            currentCost:
              prev.currentCost +
              this.normalizeFinanceAmount(row.totalCost, row.regionsName),
          });
        });

      return Array.from(map.values());
    }

    const result = this.financeRevenueResult();
    if (!result) return [];

    return (result.revenueData ?? [])
      .filter((r) => this.matchFinanceRow(r))
      .map((row) => ({
        branchName: row.branchName,
        regionsName: row.regionsName,
        currentAmount: this.normalizeFinanceAmount(row.totalAmount, row.regionsName),
        currentCost: this.normalizeFinanceAmount(row.totalCost, row.regionsName),
      }));
  });

  financeTotalAmount = computed(() =>
    this.financeDisplayRows().reduce((sum, row) => sum + row.currentAmount, 0),
  );

  financeLastTotalAmount = computed(() =>
    this.financeDisplayRows().reduce((sum, row) => sum + (row.lastAmount ?? 0), 0),
  );

  financeTotalCost = computed(() =>
    this.financeDisplayRows().reduce((sum, row) => sum + row.currentCost, 0),
  );

  financeCostRatio = computed(() => {
    const total = this.financeTotalAmount();
    if (!total) return 0;
    return (this.financeTotalCost() / total) * 100;
  });

  financeGrowth = computed(() =>
    this.calcGrowth(this.financeTotalAmount(), this.financeLastTotalAmount()),
  );

  financeChartRows = computed<FinanceChartRow[]>(() => {
    if (this.financeMode() === 'month') {
      const result = this.financeMonthlyResult();
      if (!result) return [];

      const rows = [
        ...(result.lastData ?? []),
        ...(result.currentData ?? []),
      ].filter((r) => this.matchFinanceRow(r));

      const map = new Map<string, FinanceChartRow>();

      rows.forEach((row) => {
        const prev = map.get(row.reportDate) ?? {
          label: row.reportDate,
          revenue: 0,
          cost: 0,
        };

        map.set(row.reportDate, {
          label: row.reportDate,
          revenue:
            prev.revenue +
            this.normalizeFinanceAmount(row.totalAmount, row.regionsName),
          cost:
            prev.cost +
            this.normalizeFinanceAmount(row.totalCost, row.regionsName),
        });
      });

      return Array.from(map.values()).sort((a, b) =>
        a.label.localeCompare(b.label),
      );
    }

    if (this.financeMode() === 'monthRange') {
      const result = this.financeMonthRangeResult();
      if (!result) return [];

      const map = new Map<string, FinanceChartRow>();

      (result.reportList ?? [])
        .filter((r) => this.matchFinanceRow(r))
        .forEach((row) => {
          const prev = map.get(row.reportDate) ?? {
            label: row.reportDate,
            revenue: 0,
            cost: 0,
          };

          map.set(row.reportDate, {
            label: row.reportDate,
            revenue:
              prev.revenue +
              this.normalizeFinanceAmount(row.totalAmount, row.regionsName),
            cost:
              prev.cost +
              this.normalizeFinanceAmount(row.totalCost, row.regionsName),
          });
        });

      return Array.from(map.values()).sort((a, b) =>
        a.label.localeCompare(b.label),
      );
    }

    return this.financeDisplayRows().map((row) => ({
      label: row.branchName,
      revenue: row.currentAmount,
      cost: row.currentCost,
    }));
  });

  financeChartMax = computed(() => {
    const rows = this.financeChartRows();
    if (!rows.length) return 1;

    return Math.max(...rows.map((r) => Math.max(r.revenue, r.cost)), 1);
  });

  shouldShowFinanceSummary = computed(() => {
    return this.hasFinanceResult() && !this.isFinanceAllCountryMode();
  });

  hasFinanceResult = computed(() => {
    return (
      this.financeMonthlyResult() !== null ||
      this.financeMonthRangeResult() !== null ||
      this.financeRevenueResult() !== null
    );
  });

  isFinanceAllCountryMode = computed(() => {
    return this.effectiveFinanceCountry() === '全部';
  });

  /* ── 稅率清單（Signal） ─────────────────────────── */
  taxes = signal<DashTax[]>([

  ]);

  /* ── 匯率查詢 ────────────────────────────────────── */
  allRates = signal<ExchangeRateVO[]>([]);
  ratesLoading = signal(false);
  rateQueryDate = signal<string>('');
  rateError = signal<string | null>(null);
  latestRateUpdatedAt = computed(() => {
    const updatedList = this.allRates()
      .map((r) => r.updatedAt)
      .filter(Boolean)
      .sort();
    return updatedList.length ? updatedList[updatedList.length - 1] : '';
  });

  /* ── 商品篩選 ─────────────────────────────────── */
  /** 料理風格篩選 */
  productStyleFilter = signal<string>('');

  /** 餐點分類篩選 */
  productCategoryFilter = signal<string>('');

  /** 商品名稱搜尋 */
  productSearch = signal<string>('');

  /** 商品篩選結果：料理風格 + 餐點分類 + 名稱搜尋 */
  filteredProducts = computed(() => {
    const styleKey = this.productStyleFilter();
    const categoryKey = this.productCategoryFilter();
    const q = this.productSearch().trim().toLowerCase();

    return this.products().filter((p) => {
      const styleOk = styleKey === '' || p.style === styleKey;
      const categoryOk = categoryKey === '' || p.category === categoryKey;
      const qOk = q === '' || p.name.toLowerCase().includes(q);

      return styleOk && categoryOk && qOk;
    });
  });

  /** 是否正在套用商品篩選 */
  hasProductFilter = computed(
    () =>
      !!this.productStyleFilter() ||
      !!this.productCategoryFilter() ||
      !!this.productSearch().trim(),
  );

  /** 重置商品篩選條件 */
  resetProductFilters(): void {
    this.productStyleFilter.set('');
    this.productCategoryFilter.set('');
    this.productSearch.set('');
  }

  /* ── Toast 通知 ─────────────────────────────────── */
  toastMsg = signal<string>('');
  toastLeaving = signal<boolean>(false); /* true 時觸發 CSS 淡出動畫 */
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private toastLeaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** 刪除確認狀態：active-warning / confirm */
  deleteConfirmState = signal<null | {
    type: 'active-warning' | 'confirm';
    ids: number[];
  }>(null);

  /** 點刪除按鈕時呼叫，依狀態顯示對應 modal */
  requestDeletePromo(promo: DashPromo): void {
    if (promo.isActive && !promo.ended) {
      this.deleteConfirmState.set({ type: 'active-warning', ids: [promo.id] });
    } else {
      this.deleteConfirmState.set({ type: 'confirm', ids: [promo.id] });
    }
  }

  confirmDelete(): void {
    const state = this.deleteConfirmState();
    if (!state) return;
    this.deleteConfirmState.set(null);

    forkJoin(
      state.ids.map((id) => this.apiService.deletePromotion(id)),
    ).subscribe({
      next: (results) => {
        const failed = results.find((res) => !this.isSuccessRes(res));
        if (failed) {
          this.showToast(this.getApiErrorMessage(failed, '⚠️ 刪除失敗'));
          return;
        }

        state.ids.forEach((id) =>
          this.promos.update((list) => list.filter((p) => p.id !== id)),
        );
        this.showToast(
          state.ids.length > 1
            ? `🗑️ 已刪除 ${state.ids.length} 個活動`
            : '🗑️ 活動已刪除',
        );
        this.selectedPromo.set(null);
      },
      error: () => this.showToast('⚠️ 刪除失敗，請確認後端連線'),
    });
  }

  cancelDeleteConfirm(): void {
    this.deleteConfirmState.set(null);
  }

  /* ── 活動詳情 ────────────────────────────────────── */
  selectedPromo = signal<DashPromo | null>(null);

  openPromoDetail(promo: DashPromo): void {
    this.selectedPromo.set(promo);
  }
  closePromoDetail(): void {
    this.selectedPromo.set(null);
  }

  /* ── 編輯活動資訊（文案 + 封面圖）────────────────── */
  editPromoInfoId = signal<number | null>(null);
  editPromoInfoDraft = {
    description: '',
    image: '',
    name: '',
    startTime: '',
    endTime: '',
  };
  editPromoInfoSaving = signal(false);

  openEditPromoInfo(promo: DashPromo): void {
    this.editPromoInfoDraft = {
      description: promo.description ?? '',
      image: promo.image ?? '',
      name: promo.rawName, // ← 補
      startTime: promo.rawStartTime, // ← 補
      endTime: promo.rawEndTime, // ← 補
    };
    this.editPromoInfoId.set(promo.id);
  }

  closeEditPromoInfo(): void {
    this.editPromoInfoId.set(null);
  }

  onEditPromoImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.editPromoInfoDraft.image = e.target?.result as string;
    };
    reader.readAsDataURL(input.files[0]);
  }

  /* ── 一鍵 AI 文案生成 ───────────────────────────── */
  generatingAiCopy = signal(false);

  generateAiCopy(): void {
    const id = this.editPromoInfoId();
    if (id === null) return;
    const promo = this.promos().find((p) => p.id === id);
    if (!promo) return;

    const imageStr = this.editPromoInfoDraft.image;
    if (!imageStr) {
      this.showToast('⚠️ 請先上傳活動封面圖片');
      return;
    }

    /* 有封面圖 → 走後端（自動存 ai_generated） */
    this.generatingAiCopy.set(true);
    const base64 = imageStr.startsWith('data:')
      ? imageStr.split(',')[1]
      : imageStr;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    this.apiService
      .generateAiPromoCopy(
        {
          promotionsId: id,
          activityName: promo.rawName,
          promotionItems: (promo.gifts ?? []).map((gift) => ({
            productId: gift.giftProductId,
            fullAmount: Number(gift.fullAmount),
          })),
        },
        blob,
      )
      .subscribe({
        next: (res: AiRes) => {
          if (!this.isSuccessRes(res)) {
            this.generatingAiCopy.set(false);
            this.showToast(this.getApiErrorMessage(res, '❌ AI 生成失敗'));
            return;
          }

          this.editPromoInfoDraft.description = res?.generatedDescription ?? '';
          this.generatingAiCopy.set(false);
        },
        error: () => {
          this.generatingAiCopy.set(false);
          this.showToast('❌ AI 生成失敗，請確認後端連線');
        },
      });
  }

  saveEditPromoInfo(): void {
    const id = this.editPromoInfoId();
    if (id === null || id < 0) return;
    this.editPromoInfoSaving.set(true);
    const req: UpdatePromotionInfoReq = {
      promotionsId: id,
      description: this.editPromoInfoDraft.description,
      promotionImg: this.editPromoInfoDraft.image || undefined,
    };
    this.apiService.updatePromotionInfo(req).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.editPromoInfoSaving.set(false);
          this.showToast(this.getApiErrorMessage(res, '❌ 更新失敗'));
          return;
        }

        const saved = { ...this.editPromoInfoDraft };
        this.promos.update((list) =>
          list.map((p) =>
            p.id === id
              ? {
                ...p,
                description: saved.description,
                image: saved.image.startsWith('data:')
                  ? `${this.apiService.getPromotionImageUrl(id)}?t=${Date.now()}`
                  : saved.image,
              }
              : p,
          ),
        );
        /* 如果詳情 modal 也打開著，同步更新 */
        const sel = this.selectedPromo();
        if (sel?.id === id) {
          this.selectedPromo.update((s) =>
            s
              ? {
                ...s,
                description: saved.description,
                image: saved.image.startsWith('data:')
                  ? `${this.apiService.getPromotionImageUrl(id)}?t=${Date.now()}`
                  : saved.image,
              }
              : null,
          );
        }
        this.editPromoInfoSaving.set(false);
        this.closeEditPromoInfo();
        this.showToast('✅ 活動資訊已更新');
      },
      error: () => {
        this.editPromoInfoSaving.set(false);
        this.showToast('❌ 更新失敗，請確認後端連線');
      },
    });
  }

  /* ── 分店清單（Signal，對應 global_area 資料表）─── */
  branches = signal<DashBranch[]>([

  ]);

  /* ── Modal 狀態 ─────────────────────────────────────── */
  activeModal = signal<
    | 'addProduct'
    | 'addPromo'
    | 'addGift'
    | 'addAccount'
    | 'addCountry'
    | 'addBranch'
    | 'editBranch'
    | 'transferBranch'
    | 'addMemberLimit'
    | null
  >(null);
  transferTargetId = signal<number | null>(null);
  transferNewAreaId = signal<number | null>(null);
  editingAccountId = signal<number | null>(null);
  newStaffResult = signal<{ name: string; account: string } | null>(null);
  editingProductId = signal<number | null>(null);
  styleOptions = signal<string[]>([]);
  categoryOptions = signal<string[]>([]);

  readonly PRODUCT_CUSTOM_VALUE = '__CUSTOM__';

  private normalizeProductOptions(list: { name?: string }[] = []): string[] {
    return [
      ...new Set(
        list
          .map((x) => x.name?.trim())
          .filter((name): name is string => !!name),
      ),
    ];
  }

  private ensureProductOptionExists(
    target: 'style' | 'category',
    value: string,
  ): void {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (target === 'style') {
      if (!this.styleOptions().includes(trimmed)) {
        this.styleOptions.update((list) => [...list, trimmed]);
      }
      return;
    }

    if (!this.categoryOptions().includes(trimmed)) {
      this.categoryOptions.update((list) => [...list, trimmed]);
    }
  }

  private getFinalProductStyle(): string {
    return this.productDraft.style === this.PRODUCT_CUSTOM_VALUE
      ? this.customProductStyle.trim()
      : this.productDraft.style.trim();
  }

  private getFinalProductCategory(): string {
    return this.productDraft.category === this.PRODUCT_CUSTOM_VALUE
      ? this.customProductCategory.trim()
      : this.productDraft.category.trim();
  }

  private refreshProductOptionLists(): void {
    this.loadStyles();
    this.loadCategories();
  }

  /* ── 表單草稿（普通屬性，開啟 modal 時重置） ─────────── */
  productDraft = {
    name: '',
    category: '',
    style: '',
    description: '',
    active: true,
  };

  /** 商品 modal：自定義料理風格 */
  customProductStyle = '';

  /** 商品 modal：自定義餐點分類 */
  customProductCategory = '';

  productImageFile: File | null = null;
  productImagePreview = signal<string>('');
  generatingAiDesc = signal(false);
  generatingPromoAiDesc = signal(false);
  promoDraft = {
    name: '',
    description: '',
    startTime: '',
    endTime: '',
    image: '',
    giftFullAmount: null as number | null,
    giftProductId: null as number | null,
    giftQuantity: -1,
  };
  showPromoPanel = signal(false);
  giftDraft = {
    promoId: 0,
    rawName: '',
    rawStartTime: '',
    rawEndTime: '',
    fullAmount: 300,
    giftProductId: null as number | null,
    quantity: -1,
  };
  giftProductList = signal<ProductAdminVo[]>([]);
  accountDraft: {
    name: string;
    account: string;
    password: string;
    branch: string;
    shift: string;
    role: 'bm' | 'ma' | 'staff';
    isActive: boolean;
    country: string;
  } = {
      name: '',
      account: '',
      password: '',
      branch: '台灣台北店',
      shift: '早班',
      role: 'bm',
      isActive: true,
      country: '台灣',
    };
  readonly COUNTRY_DATA: { name: string; code: string; currency: string }[] = [
    // 東亞
    { name: '台灣', code: 'TW', currency: 'TWD' },
    { name: '日本', code: 'JP', currency: 'JPY' },
    { name: '韓國', code: 'KR', currency: 'KRW' },
    { name: '中國', code: 'CN', currency: 'CNY' },
    { name: '香港', code: 'HK', currency: 'HKD' },
    { name: '澳門', code: 'MO', currency: 'MOP' },
    { name: '蒙古', code: 'MN', currency: 'MNT' },
    // 東南亞
    { name: '泰國', code: 'TH', currency: 'THB' },
    { name: '越南', code: 'VN', currency: 'VND' },
    { name: '印尼', code: 'ID', currency: 'IDR' },
    { name: '馬來西亞', code: 'MY', currency: 'MYR' },
    { name: '新加坡', code: 'SG', currency: 'SGD' },
    { name: '菲律賓', code: 'PH', currency: 'PHP' },
    { name: '柬埔寨', code: 'KH', currency: 'KHR' },
    { name: '緬甸', code: 'MM', currency: 'MMK' },
    { name: '寮國', code: 'LA', currency: 'LAK' },
    { name: '汶萊', code: 'BN', currency: 'BND' },
    { name: '東帝汶', code: 'TL', currency: 'USD' },
    // 南亞
    { name: '印度', code: 'IN', currency: 'INR' },
    { name: '孟加拉', code: 'BD', currency: 'BDT' },
    { name: '巴基斯坦', code: 'PK', currency: 'PKR' },
    { name: '斯里蘭卡', code: 'LK', currency: 'LKR' },
    { name: '尼泊爾', code: 'NP', currency: 'NPR' },
    { name: '不丹', code: 'BT', currency: 'BTN' },
    { name: '馬爾地夫', code: 'MV', currency: 'MVR' },
    // 中亞
    { name: '哈薩克', code: 'KZ', currency: 'KZT' },
    { name: '烏茲別克', code: 'UZ', currency: 'UZS' },
    { name: '吉爾吉斯', code: 'KG', currency: 'KGS' },
    { name: '塔吉克', code: 'TJ', currency: 'TJS' },
    { name: '土庫曼', code: 'TM', currency: 'TMT' },
    // 西亞／中東
    { name: '阿拉伯聯合大公國', code: 'AE', currency: 'AED' },
    { name: '沙烏地阿拉伯', code: 'SA', currency: 'SAR' },
    { name: '卡達', code: 'QA', currency: 'QAR' },
    { name: '科威特', code: 'KW', currency: 'KWD' },
    { name: '巴林', code: 'BH', currency: 'BHD' },
    { name: '以色列', code: 'IL', currency: 'ILS' },
    { name: '土耳其', code: 'TR', currency: 'TRY' },
    { name: '伊朗', code: 'IR', currency: 'IRR' },
  ];

  /** 新增國家下拉選單：排除已存在於國家基本設定的國家 */
  availableCountryOptions = computed(() => {
    const existingCountries = new Set(
      this.taxes()
        .map((t) => t.country.trim())
        .filter(Boolean),
    );

    return this.COUNTRY_DATA.filter(
      (c) => !existingCountries.has(c.name.trim()),
    );
  });

  taxDraft: {
    country: string;
    countryCode: string;
    currency: string;
    taxType: 'INCLUSIVE' | 'EXCLUSIVE';
    rate: number;
  } = {
      country: '',
      countryCode: '',
      currency: '',
      taxType: 'INCLUSIVE',
      rate: 0,
    };

  onCountrySelect(name: string): void {
    const found = this.COUNTRY_DATA.find((c) => c.name === name);
    if (found) {
      this.taxDraft.countryCode = found.code;
      this.taxDraft.currency = found.currency;
    }
  }

  branchDraft = { regionsId: 0, branch: '', address: '', phone: '' };
  editBranchDraft = { id: 0, regionsId: 0, branch: '', address: '', phone: '' };

  /** API 共用成功判斷：只有 code === 200 才視為成功 */
  private isSuccessRes(res: { code?: number | null } | null | undefined): boolean {
    return res?.code === 200;
  }

  /** API 共用錯誤訊息：優先顯示後端 message，沒有才使用預設文字 */
  private getApiErrorMessage(
    res: { code?: number | null; message?: string | null } | null | undefined,
    fallback: string,
  ): string {
    return res?.message || fallback;
  }

  showToast(msg: string): void {
    /* 清除所有計時器，重置離場狀態 */
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    if (this.toastLeaveTimer !== null) clearTimeout(this.toastLeaveTimer);
    this.toastLeaving.set(false);
    this.toastMsg.set(msg);

    /* 2300ms 後啟動淡出動畫（300ms），2600ms 後真正隱藏 */
    this.toastLeaveTimer = setTimeout(() => {
      this.toastLeaving.set(true);
      this.toastTimer = setTimeout(() => {
        this.toastMsg.set('');
        this.toastLeaving.set(false);
      }, 300);
    }, 2300);
  }

  /* 計時器 ID */
  private clockInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private router: Router,
    public authService: AuthService,
    private apiService: ApiService,
  ) { }

  ngOnInit(): void {
    const user = this.authService.currentUser;
    if (!user || user.role !== 'boss') {
      this.router.navigate(['/staff-login']);
      return;
    }
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
    this.loadTaxes(() => this.loadBranches(() => this.loadStaff()));
    this.loadPromos();
    this.loadAllRates();
    this.loadStyles();
    this.loadCategories();
    this.loadProducts();
    this.loadDiscounts();
    this.loadAllRates();
  }

  ngOnDestroy(): void {
    if (this.clockInterval !== null) clearInterval(this.clockInterval);
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    if (this.toastLeaveTimer !== null) clearTimeout(this.toastLeaveTimer);
  }

  /* ── 國家 → 旗幟 Emoji 對照 ─────────────────────── */
  private countryToFlag(country: string): string {
    const map: Record<string, string> = {
      台灣: '🇹🇼',
      日本: '🇯🇵',
      泰國: '🇹🇭',
      韓國: '🇰🇷',
      美國: '🇺🇸',
      英國: '🇬🇧',
      法國: '🇫🇷',
      德國: '🇩🇪',
      中國: '🇨🇳',
      印度: '🇮🇳',
      澳洲: '🇦🇺',
      加拿大: '🇨🇦',
      新加坡: '🇸🇬',
      馬來西亞: '🇲🇾',
      印尼: '🇮🇩',
      越南: '🇻🇳',
    };
    return map[country] ?? '🏳️';
  }

  /* ── 從後端重新載入分店清單 ──────────────────────── */

  private loadBranches(onComplete?: () => void): void {
    this.apiService.getAllBranches().subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          console.warn('[Manager] 分店 API 回傳失敗:', res?.message);
          onComplete?.();
          return;
        }

        if (res?.globalAreaList?.length) {
          this.branches.set(
            res.globalAreaList.map((b: GlobalAreaVO) => {
              const country =
                b.country ||
                this.taxes().find((t) => t.id === (b.regionsId ?? 0))
                  ?.country ||
                '';
              return {
                id: b.id,
                name: b.branch,
                country,
                regionsId: b.regionsId ?? 0,
                address: b.address,
                phone: b.phone,
              };
            }),
          );
        }
        /* 若後端回傳空清單，保留 mock 初始值供 Demo 使用 */
        onComplete?.();
      },
      error: () => {
        console.warn('[Manager] 分店 API 連線失敗，使用 Demo 資料');
        onComplete?.();
      },
    });
  }

  /* ── 從後端重新載入稅率清單 ──────────────────────── */
  private loadTaxes(onComplete?: () => void): void {
    this.apiService.getAllTax().subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          console.warn('[Manager] 稅率 API 回傳失敗:', res?.message);
          onComplete?.();
          return;
        }

        if (res?.regionsList?.length) {
          const seen = new Set<string>();
          const deduped = res.regionsList.filter((r: RegionVO) => {
            if (seen.has(r.country)) return false;
            seen.add(r.country);
            return true;
          });
          this.taxes.set(
            deduped.map((r: RegionVO) => {
              const rate = +(+r.taxRate * 100).toFixed(2);
              // regions/update 後端不支援 usageCap 欄位，改由 localStorage 持久化
              const saved = localStorage.getItem(`discountLimit_${r.id}`);
              const cap = saved !== null ? +saved : (r.usageCap ?? 0);
              return {
                id: r.id,
                country: r.country,
                countryCode: (r.countryCode ?? '').toUpperCase(),
                currency: r.currencyCode.toUpperCase(),
                taxType: r.taxType ?? 'INCLUSIVE',
                rate,
                discountLimit: cap,
                editing: false,
                editRate: rate,
                editTaxType: r.taxType ?? 'INCLUSIVE',
                editDiscountLimit: cap,
              };
            }),
          );
        }
        onComplete?.();
      },
      error: () => {
        console.warn('[Manager] 稅率 API 連線失敗，使用 Demo 資料');
        onComplete?.();
      },
    });
  }

  /* ── 從後端重新載入促銷活動清單 ─────────────────── */
  private loadPromos(): void {
    this.apiService.getPromotionsList().subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.promos.set([]);
          this.showToast(this.getApiErrorMessage(res, '活動資料載入失敗'));
          return;
        }

        this.promos.set(
          (res?.data ?? []).map((p: PromotionDetailVo) => {
            const imageUrl = `${this.apiService.getPromotionImageUrl(p.id)}?v=${p.id}-${p.startTime}-${p.endTime}`;
            return {
              id: p.id,
              title: p.name + (p.gifts?.length ? `（${p.gifts.length} 項贈品）` : ''),
              scope: `${p.startTime} ～ ${p.endTime}`,
              isActive: p.active,
              color: p.active ? '#c49756' : 'rgba(255,255,255,0.18)',
              badgeColor: p.active ? '#c49756' : '#6b7280',
              ended: !!p.endTime && new Date(p.endTime) < new Date(),
              rawName: p.name,
              rawStartTime: p.startTime,
              rawEndTime: p.endTime,
              type: 'promotion' as const,
              description: p.description ?? '',
              image: imageUrl,
              gifts: p.gifts ?? [],
            };
          }),
        );
      },
      error: () => {
        console.warn('[Manager] 活動 API 連線失敗');
      },
    });
  }

  /* ── 從後端載入商品清單 ──────────────────────────── */

  //
  private cleanBase64(raw: string): string {
    if (!raw) return '';
    if (raw.startsWith('data:')) return raw.replace(/[\r\n\s]/g, '');
    const cleaned = raw.replace(/[\r\n\s]/g, '');
    return `data:image/jpeg;base64,${cleaned}`;
  }

  private toImg(raw: string): string {
    if (!raw) return '';
    // PR #52: 後端 foodImgBase64 現在回傳 URL 路徑 /lazybaobao/product/image/{id}?v=...
    if (raw.startsWith('/') || raw.startsWith('http')) return raw;
    return this.cleanBase64(raw);
  }

  private loadStyles(): void {
    this.apiService.getStyles().subscribe({
      next: (list) => {
        this.styleOptions.set(this.normalizeProductOptions(list));
      },
      error: (err) => console.error('❌ loadStyles 失敗:', err),
    });
  }

  private loadCategories(): void {
    this.apiService.getCategories().subscribe({
      next: (list) => {
        this.categoryOptions.set(this.normalizeProductOptions(list));
      },
      error: (err) => console.error('❌ loadCategories 失敗:', err),
    });
  }

  private mapAdminProductToDashProduct(p: ProductAdminVo): DashProduct {
    return {
      id: p.id,
      name: p.name,
      category: p.category || '',
      style: p.style || '',
      description: p.description || '',
      isActive: p.active,
      foodImgBase64: this.toImg(p.foodImgBase64 ?? ''),
    };
  }

  private loadProducts(): void {
    this.apiService.getAllProducts().subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.products.set([]);
          this.showToast(this.getApiErrorMessage(res, '⚠️ 商品資料載入失敗'));
          return;
        }

        const list = res?.productList ?? [];
        this.products.set(list.map((p) => this.mapAdminProductToDashProduct(p)));
      },
      error: (err) => {
        console.error('❌ loadProducts 失敗:', err);
        this.products.set([]);
        this.showToast('⚠️ 商品資料載入失敗，請確認後端連線');
      },
    });
  }

  /* ── 折抵：載入清單 ──────────────────────────────── */
  private loadDiscounts(): void {
    this.discountLoading.set(true);
    this.apiService.getDiscountList().subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.discounts.set([]);
          this.discountLoading.set(false);
          console.warn('[Manager] 折抵 API 回傳失敗:', res?.message);
          return;
        }

        this.discounts.set(res?.discountList ?? []);
        this.discountLoading.set(false);
      },
      error: () => {
        this.discountLoading.set(false);
        console.warn('[Manager] 折抵 API 連線失敗，使用空清單');
      },
    });
  }

  /* ── 折抵：inline 編輯 ───────────────────────────── */
  startEditDiscount(d: DiscountRecord): void {
    this.editingDiscountId.set(d.id);
    this.editDiscountCap.set(d.usageCap);
    this.editDiscountCount.set(d.count);
  }

  cancelEditDiscount(): void {
    this.editingDiscountId.set(null);
  }

  saveEditDiscount(d: DiscountRecord): void {
    const req: DiscountReq = {
      id: d.id,
      regionsId: d.regionsId,
      count: this.editDiscountCount(),
      usageCap: this.editDiscountCap(),
    };
    this.apiService.updateDiscountSettings(req).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.showToast(this.getApiErrorMessage(res, '❌ 更新失敗'));
          return;
        }

        this.loadDiscounts();
        this.editingDiscountId.set(null);
        this.showToast('✅ 折抵設定已更新');
      },
      error: () => this.showToast('❌ 更新失敗'),
    });
  }

  /* ── 折抵：刪除 ──────────────────────────────────── */
  deleteDiscountRecord(id: number): void {
    this.apiService.deleteDiscount(id).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.showToast(this.getApiErrorMessage(res, '❌ 刪除失敗'));
          return;
        }

        this.discounts.update((list) => list.filter((d) => d.id !== id));
        this.showToast('🗑️ 折抵記錄已刪除');
      },
      error: () => this.showToast('❌ 刪除失敗'),
    });
  }

  /* ── 折抵：依 regionsId 取得國家名稱 ──────────────── */
  getDiscountCountryName(regionsId: number): string {
    return (
      this.taxes().find((t) => t.id === regionsId)?.country ??
      `地區 #${regionsId}`
    );
  }

  private loadStaff(): void {
    this.apiService.getAllStaff().subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          console.warn('[Manager] 員工 API 回傳失敗:', res?.message);
          return;
        }

        if (res?.staffList?.length) {
          this.accounts.set(
            res.staffList
              .filter((s: StaffVO) => s.role !== 'ADMIN')
              .map((s: StaffVO) => {
                const branchData = this.branches().find(
                  (b) => b.id === s.globalAreaId,
                );
                const branchName = branchData?.name ?? `分店 ${s.globalAreaId}`;
                const role = this.resolveAccountRole(s.account, s.role);
                return {
                  id: s.id,
                  name: s.name,
                  account: s.account,
                  branch: branchName,
                  joinedAt: s.hireAt?.slice(0, 10) ?? '',
                  isActive: s.status ?? true,
                  role,
                  backendRole: s.role,
                  country: branchData?.country ?? '',
                };
              })
              .sort((a, b) => this.sortAccountsByCountryBranch(a, b)),
          );
        }
      },
      error: () => console.warn('[Manager] 員工 API 連線失敗，使用 Demo 資料'),
    });
  }

  private sortAccountsByCountryBranch(a: DashAccount, b: DashAccount): number {
    const countryCompare = this.compareCountry(a.country, b.country);
    if (countryCompare !== 0) return countryCompare;

    const branchCompare = (a.branch || '').localeCompare(b.branch || '', 'zh-Hant');
    if (branchCompare !== 0) return branchCompare;

    const roleOrder: Record<DashAccount['role'], number> = {
      bm: 1,
      ma: 2,
      staff: 3,
    };

    const roleCompare = roleOrder[a.role] - roleOrder[b.role];
    if (roleCompare !== 0) return roleCompare;

    return (a.account || '').localeCompare(b.account || '', 'zh-Hant');
  }

  private updateClock(): void {
    const now = new Date();
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const yy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    this.clockStr.set(
      `${yy}-${mm}-${dd} 星期${days[now.getDay()]} ${hh}:${min}`,
    );
  }

  setTab(tab: DashTab): void {
    this.activeTab.set(tab);
  }
  setUserSubTab(sub: UserSubTab): void {
    this.userSubTab.set(sub);
  }

  get topbarTitle(): string {
    return this.TAB_TITLES[this.activeTab()];
  }

  get isAdmin(): boolean {
    return this.authService.currentUser?.role === 'boss';
  }

  getAvatarLetter(): string {
    return this.authService.currentUser?.name?.charAt(0) ?? '?';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/staff-login']);
  }

  /* ── 商品：上/下架切換 ─────────────────────────── */
  toggleProduct(id: number): void {
    const p = this.products().find((x) => x.id === id);
    if (!p) return;
    const newActive = !p.isActive;
    this.products.update((list) =>
      list.map((x) => (x.id === id ? { ...x, isActive: newActive } : x)),
    );
    this.apiService.toggleProduct(id, newActive).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.products.update((list) =>
            list.map((x) => (x.id === id ? { ...x, isActive: !newActive } : x)),
          );
          this.showToast(this.getApiErrorMessage(res, '⚠️ 切換上下架失敗，請重試'));
          return;
        }

        // loadProducts() 已移除，避免覆蓋 isActive
        this.showToast(newActive ? '✅ 商品已上架' : '⏸️ 商品已下架');
      },
      error: () => {
        this.products.update((list) =>
          list.map((x) => (x.id === id ? { ...x, isActive: !newActive } : x)),
        );
        this.showToast('⚠️ 切換上下架失敗，請重試');
      },
    });
  }

  /* ── 商品：回收桶 / 軟刪除 ─────────────────────────── */

  /** 切換一般商品 / 已刪除商品列表 */
  toggleProductTrash(): void {
    const next = !this.showTrash();
    this.showTrash.set(next);

    if (next) {
      this.resetProductFilters();
      this.loadTrashProducts();
    }
  }

  /** 載入已刪除商品清單 */
  private loadTrashProducts(): void {
    this.apiService.getTrashProducts().subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.trashProducts.set([]);
          this.showToast(this.getApiErrorMessage(res, '⚠️ 已刪除商品載入失敗'));
          return;
        }

        const list = res?.productList ?? [];
        this.trashProducts.set(list.map((p) => this.mapAdminProductToDashProduct(p)));
      },
      error: () => {
        this.trashProducts.set([]);
        this.showToast('⚠️ 已刪除商品載入失敗，請確認後端連線');
      },
    });
  }

  /** 軟刪除商品 */
  deleteProduct(id: number): void {
    const p = this.products().find((x) => x.id === id);
    if (!p) return;

    const ok = window.confirm(`確定要刪除商品「${p.name}」嗎？\n刪除後可在「已刪除商品」中查看。`);
    if (!ok) return;

    this.apiService.deleteProduct(id).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.showToast(this.getApiErrorMessage(res, '⚠️ 商品刪除失敗'));
          return;
        }

        this.products.update((list) => list.filter((x) => x.id !== id));
        this.showToast(`🗑️ 商品「${p.name}」已移至已刪除商品`);
      },
      error: () => {
        this.showToast('⚠️ 商品刪除失敗，請確認後端連線');
      },
    });
  }

  /* ── 今日日期（YYYY-MM-DD），供活動開始日期 [min] 使用 ── */
  today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /* ── 活動：刪除（由 confirmDelete 執行，不直接呼叫）── */
  deletePromo(id: number): void {
    const promo = this.promos().find((p) => p.id === id);
    if (promo) this.requestDeletePromo(promo);
  }

  /* ── 活動：啟用/停用切換 ─────────────────────────── */
  togglePromo(id: number): void {
    const current = this.promos().find((p) => p.id === id);
    if (!current || current.ended) return;
    const newActive = !current.isActive;
    /* 樂觀更新 UI */
    this.promos.update((list) =>
      list.map((p) =>
        p.id === id
          ? {
            ...p,
            isActive: newActive,
            color: newActive ? '#c49756' : 'rgba(255,255,255,0.18)',
          }
          : p,
      ),
    );
    this.apiService
      .togglePromotion({
        name: current.rawName,
        startTime: current.rawStartTime,
        endTime: current.rawEndTime,
        promotionsId: id,
        active: newActive,
      })
      .subscribe({
        next: (res) => {
          if (!this.isSuccessRes(res)) {
            this.promos.update((list) =>
              list.map((p) =>
                p.id === id
                  ? {
                    ...p,
                    isActive: !newActive,
                    color: !newActive ? '#c49756' : 'rgba(255,255,255,0.18)',
                  }
                  : p,
              ),
            );
            this.showToast(this.getApiErrorMessage(res, '❌ 切換失敗'));
            return;
          }

          this.showToast(newActive ? '✅ 活動已啟用' : '⏸️ 活動已暫停');
        },
        error: () => {
          /* API 失敗時還原 */
          this.promos.update((list) =>
            list.map((p) =>
              p.id === id
                ? {
                  ...p,
                  isActive: !newActive,
                  color: !newActive ? '#c49756' : 'rgba(255,255,255,0.18)',
                }
                : p,
            ),
          );
          this.showToast('❌ 切換失敗，請確認後端連線');
        },
      });
  }

  /* ── 活動：新增贈品規則 ─────────────────────────── */
  openAddGift(promoId: number): void {
    const promo = this.promos().find((p) => p.id === promoId);
    if (!promo) return;
    this.giftDraft = {
      promoId,
      rawName: promo.rawName,
      rawStartTime: promo.rawStartTime,
      rawEndTime: promo.rawEndTime,
      fullAmount: 300,
      giftProductId: null,
      quantity: -1,
    };
    if (this.giftProductList().length === 0) {
      this.apiService.getAllProducts().subscribe({
        next: (res) => {
          if (!this.isSuccessRes(res)) {
            this.showToast(this.getApiErrorMessage(res, '⚠️ 贈品商品清單載入失敗'));
            return;
          }

          this.giftProductList.set(
            (res?.productList ?? []).filter(p => p.active),
          );
        },
      });
    }
    this.activeModal.set('addGift');
  }

  saveGift(): void {
    if (this.giftDraft.quantity === 0 || this.giftDraft.quantity < -1) {
      this.showToast('⚠️ 贈品數量請輸入 -1 或大於 0 的正整數');
      return;
    }
    if (this.giftDraft.fullAmount <= 0) {
      this.showToast('⚠️ 滿額門檻需大於 0');
      return;
    }
    const d = this.giftDraft;
    this.apiService
      .addGift({
        name: d.rawName,
        startTime: d.rawStartTime,
        endTime: d.rawEndTime,
        promotionsId: d.promoId,
        fullAmount: d.fullAmount,
        giftProductId: d.giftProductId!,
        quantity: d.quantity,
      })
      .subscribe({
        next: (res) => {
          if (!this.isSuccessRes(res)) {
            this.showToast(this.getApiErrorMessage(res, '❌ 新增失敗'));
            return;
          }

          this.loadPromos();
          this.closeModal();
          this.showToast('✅ 贈品規則已新增');
        },
        error: () => this.showToast('❌ 新增失敗，請確認後端連線'),
      });
  }

  /* ── 帳號：停/復權 ─────────────────────────────── */
  toggleAccount(id: number): void {
    const target = this.accounts().find((a) => a.id === id);
    if (!target) return;
    const newStatus = !target.isActive;
    this.accounts.update((list) =>
      list.map((a) => (a.id === id ? { ...a, isActive: newStatus } : a)),
    );
    this.apiService.updateStaffStatus(id, { newStatus: newStatus }).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.accounts.update((list) =>
            list.map((a) => (a.id === id ? { ...a, isActive: !newStatus } : a)),
          );
          this.showToast(this.getApiErrorMessage(res, '⚠️ 更新失敗'));
          return;
        }

        this.showToast(
          newStatus
            ? `✅ 帳號「${target.name}」已復權`
            : `🔒 帳號「${target.name}」已停權`,
        );
      },
      error: () => {
        this.accounts.update((list) =>
          list.map((a) => (a.id === id ? { ...a, isActive: !newStatus } : a)),
        );
        this.showToast('⚠️ 更新失敗，請確認後端連線');
      },
    });
  }

  /* ── 帳號：晉升為副店長（RM 分店長用，manager-dashboard 不使用）── */
  promoteAccount(id: number): void {
    const target = this.accounts().find((a) => a.id === id);
    if (!target) return;
    this.apiService.toggleStaff(id).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.showToast(this.getApiErrorMessage(res, '⚠️ 晉升失敗'));
          return;
        }

        this.showToast(`✅ 帳號「${target.name}」已晉升為副店長`);
        this.loadStaff();
      },
      error: () => this.showToast('⚠️ 晉升失敗，請確認後端連線'),
    });
  }

  /* ── 帳號：重設密碼（老闆對 RM 操作） ────────────── */
  resetPasswordAccount(id: number): void {
    const target = this.accounts().find((a) => a.id === id);
    if (!target) return;
    this.apiService.changeStaffPassword(id).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.showToast(this.getApiErrorMessage(res, '⚠️ 重設密碼失敗'));
          return;
        }

        this.showToast(`✅「${target.name}」密碼已重設為預設值 00000`);
      },
      error: () => this.showToast('⚠️ 重設密碼失敗，請確認後端連線'),
    });
  }

  /* ── 帳號：老闆調整職務 ──────────────────────────── */
  adminChangeRoleAction(id: number, targetRole: string): void {
    const target = this.accounts().find((a) => a.id === id);
    if (!target) return;
    const roleLabel: Record<string, string> = {
      REGION_MANAGER: '分店長',
      MANAGER_AGENT: '副店長',
      STAFF: '員工',
    };
    this.apiService.adminChangeStaffRole(id, targetRole).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.showToast(this.getApiErrorMessage(res, '⚠️ 職務調整失敗'));
          return;
        }

        this.showToast(`✅「${target.name}」已調整為${roleLabel[targetRole]}`);
        this.loadStaff();
      },
      error: () => this.showToast('⚠️ 職務調整失敗，請確認後端連線'),
    });
  }

  /* ── 帳號：老闆調換分店 ──────────────────────────── */
  get transferTarget(): DashAccount | undefined {
    return this.accounts().find((a) => a.id === this.transferTargetId());
  }

  openTransferBranch(id: number): void {
    this.transferTargetId.set(id);
    this.transferNewAreaId.set(null);
    this.activeModal.set('transferBranch');
  }

  confirmTransfer(): void {
    const id = this.transferTargetId();
    const newAreaId = this.transferNewAreaId();
    if (!id || !newAreaId) {
      this.showToast('⚠️ 請選擇目標分店');
      return;
    }
    const target = this.accounts().find((a) => a.id === id);
    this.apiService.transferStaff(id, newAreaId).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.showToast(this.getApiErrorMessage(res, '⚠️ 調換分店失敗'));
          return;
        }

        this.showToast(`✅「${target?.name}」已調換至新分店`);
        this.closeModal();
        this.loadStaff();
      },
      error: () => this.showToast('⚠️ 調換分店失敗，請確認後端連線'),
    });
  }

  /* ── 稅率：啟動編輯 ─────────────────────────────── */
  //   startEditTax(id: number): void {
  //     this.taxes.update((list) =>
  //       list.map((t) =>
  //         t.id === id ? { ...t, editing: true, editValue: t.rate } : t,
  //       ),
  //     );
  //   }

  //   onTaxInput(id: number, event: Event): void {
  //     const val = parseFloat((event.target as HTMLInputElement).value);
  //     if (!isNaN(val)) {
  //       this.taxes.update((list) =>
  //         list.map((t) => (t.id === id ? { ...t, editValue: val } : t)),
  //       );
  //     }
  //   }

  //   saveTax(id: number): void {
  //     /* 先樂觀更新 UI */
  //     this.taxes.update((list) =>
  //       list.map((t) =>
  //         t.id === id ? { ...t, rate: t.editValue, editing: false } : t,
  //       ),
  //     );
  //     const target = this.taxes().find((t) => t.id === id);
  //     if (!target) return;
  //     /* 同步至後端（currencyCode 以國家查詢，或以 TWD 作預設） */
  //     const currencyMap: Record<string, string> = {
  //       台灣: 'TWD',
  //       日本: 'JPY',
  //       泰國: 'THB',
  //       韓國: 'KRW',
  //       美國: 'USD',
  //       英國: 'GBP',
  //       法國: 'EUR',
  //       德國: 'EUR',
  //       新加坡: 'SGD',
  //       馬來西亞: 'MYR',
  //       印尼: 'IDR',
  //       越南: 'VND',
  //     };
  //     this.apiService
  //       .updateRegion({
  //         id,
  //         taxRate: target.editValue / 100,
  //         taxType: target.taxType,
  //       })
  //       .subscribe({
  //         next: () => this.showToast('稅率已同步至後端'),
  //         error: () => this.showToast('稅率已更新，後端同步失敗（請確認連線）'),
  //       });
  //   }

  //   cancelEditTax(id: number): void {
  //     this.taxes.update((list) =>
  //       list.map((t) => (t.id === id ? { ...t, editing: false } : t)),
  //     );
  //   }

  /* ── 折扣上限：啟動編輯 ─────────────────────────── */
  //   startEditDiscount(id: number): void {
  //     this.taxes.update((list) =>
  //       list.map((t) =>
  //         t.id === id
  //           ? { ...t, editingDiscount: true, editDiscountValue: t.discountLimit }
  //           : t,
  //       ),
  //     );
  //   }

  //   onDiscountInput(id: number, event: Event): void {
  //     const val = parseFloat((event.target as HTMLInputElement).value);
  //     if (!isNaN(val) && val >= 0) {
  //       this.taxes.update((list) =>
  //         list.map((t) => (t.id === id ? { ...t, editDiscountValue: val } : t)),
  //       );
  //     }
  //   }

  //   saveDiscount(id: number): void {
  //     const target = this.taxes().find((t) => t.id === id);
  //     if (!target) return;
  //     this.taxes.update((list) =>
  //       list.map((t) =>
  //         t.id === id
  //           ? { ...t, discountLimit: t.editDiscountValue, editingDiscount: false }
  //           : t,
  //       ),
  //     );
  //     this.apiService
  //       .updateRegion({
  //         id,
  //         taxRate: target.rate / 100,
  //         taxType: target.taxType,
  //         usageCap: target.editDiscountValue,
  //       })
  //       .subscribe({
  //         next: () => this.showToast('✅ 折扣上限已更新'),
  //         error: () => this.showToast('⚠️ 更新失敗，請確認後端連線'),
  //       });
  //   }

  //   cancelEditDiscount(id: number): void {
  //     this.taxes.update((list) =>
  //       list.map((t) => (t.id === id ? { ...t, editingDiscount: false } : t)),
  //     );
  //   }

  startEditTax(id: number): void {
    this.taxes.update((list) =>
      list.map((t) =>
        t.id === id
          ? {
            ...t,
            editing: true,
            editRate: t.rate,
            editTaxType: t.taxType,
            editDiscountLimit: t.discountLimit,
          }
          : t,
      ),
    );
  }

  cancelEditTax(id: number): void {
    this.taxes.update((list) =>
      list.map((t) => (t.id === id ? { ...t, editing: false } : t)),
    );
  }

  saveTax(id: number): void {
    const target = this.taxes().find((t) => t.id === id);
    if (!target) return;

    const nextRate = Number(target.editRate);
    const nextTaxType = target.editTaxType || target.taxType;

    if (Number.isNaN(nextRate) || nextRate < 0) {
      this.showToast('⚠️ 請輸入正確稅率');
      return;
    }

    this.apiService
      .updateRegion({
        id,
        taxRate: nextRate / 100,
        taxType: nextTaxType,
      })
      .subscribe({
        next: (res) => {
          if (!this.isSuccessRes(res)) {
            this.showToast(this.getApiErrorMessage(res, '⚠️ 稅率更新失敗'));
            return;
          }

          this.taxes.update((list) =>
            list.map((t) =>
              t.id === id
                ? {
                  ...t,
                  rate: nextRate,
                  taxType: nextTaxType,
                  editRate: nextRate,
                  editTaxType: nextTaxType,
                  editing: false,
                }
                : t,
            ),
          );

          this.showToast('✅ 稅率設定已更新');
        },
        error: () => this.showToast('⚠️ 更新失敗，請確認後端連線'),
      });
  }

  /* ── 會員設定：新增上限 Modal ───────────────────── */
  addLimitRegionsId = signal(0);
  addLimitAmount = signal(0);
  addLimitCount = signal(0);
  addLimitSelectedTax = computed(() =>
    this.availableMemberLimitCountries().find(
      (t) => t.id === this.addLimitRegionsId(),
    ),
  );

  openAddMemberLimit(): void {
    this.addLimitRegionsId.set(0);
    this.addLimitAmount.set(0);
    this.addLimitCount.set(0);
    this.activeModal.set('addMemberLimit');
  }

  saveAddMemberLimit(): void {
    const regionsId = this.addLimitRegionsId();
    const usageCap = Number(this.addLimitAmount());
    const count = Number(this.addLimitCount());

    if (!regionsId) {
      this.showToast('⚠️ 請選擇國家／地區');
      return;
    }

    if (usageCap < 0 || Number.isNaN(usageCap)) {
      this.showToast('⚠️ 請輸入正確的折扣上限金額');
      return;
    }

    if (count < 0 || Number.isNaN(count)) {
      this.showToast('⚠️ 請輸入正確的累積次數');
      return;
    }

    const exists = this.discounts().some((d) => d.regionsId === regionsId);
    if (exists) {
      this.showToast('⚠️ 此國家已建立會員優惠設定');
      return;
    }

    this.apiService
      .createDiscount({
        regionsId,
        count,
        usageCap,
      })
      .subscribe({
        next: (res) => {
          if (!this.isSuccessRes(res)) {
            this.showToast(this.getApiErrorMessage(res, '⚠️ 新增失敗'));
            return;
          }

          this.loadDiscounts();
          this.closeModal();
          this.showToast('✅ 會員優惠設定已新增');
        },
        error: () => {
          this.showToast('⚠️ 新增失敗，請確認後端連線');
        },
      });
  }

  /* ── 會員設定：啟動 / 儲存 / 取消 ─────────────── */
  startEditMember(taxId: number): void {
    const row = this.memberData().find((r) => r.tax.id === taxId);
    if (!row) return;
    this.editingMemberRegionId.set(taxId);
    this.editMemberLimit.set(row.disc.usageCap);
    this.editMemberCap.set(row.disc.count);
  }

  cancelEditMember(): void {
    this.editingMemberRegionId.set(null);
  }

  saveMemberSettings(taxId: number): void {
    const row = this.memberData().find((r) => r.tax.id === taxId);
    if (!row) return;

    const { disc } = row;
    const usageCap = Number(this.editMemberLimit());
    const count = Number(this.editMemberCap());

    if (usageCap < 0 || Number.isNaN(usageCap)) {
      this.showToast('⚠️ 請輸入正確的折扣上限金額');
      return;
    }

    if (count < 0 || Number.isNaN(count)) {
      this.showToast('⚠️ 請輸入正確的累積次數');
      return;
    }

    if (!disc?.id) {
      this.showToast('⚠️ 此國家尚未建立會員優惠設定，請先新增上限');
      return;
    }

    this.apiService
      .updateDiscountSettings({
        id: disc.id,
        regionsId: taxId,
        count,
        usageCap,
      })
      .subscribe({
        next: (res) => {
          if (!this.isSuccessRes(res)) {
            this.showToast(this.getApiErrorMessage(res, '⚠️ 更新失敗'));
            return;
          }

          this.loadDiscounts();
          this.editingMemberRegionId.set(null);
          this.showToast('✅ 會員設定已更新');
        },
        error: () => {
          this.showToast('⚠️ 更新失敗，請確認後端連線');
        },
      });
  }

  /* ── 匯率：載入全部（最新）──────────────────────── */
  loadAllRates(): void {
    this.rateQueryDate.set('');
    this.rateError.set(null);
    this.ratesLoading.set(true);
    this.apiService.getAllRates().subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.allRates.set([]);
          this.rateError.set(this.getApiErrorMessage(res, '匯率載入失敗'));
          this.ratesLoading.set(false);
          return;
        }

        this.allRates.set(this.normalizeRates(res?.exchangeRatesList ?? []));
        this.ratesLoading.set(false);
      },
      error: () => {
        this.allRates.set([]);
        this.rateError.set('匯率載入失敗，請確認後端連線');
        this.ratesLoading.set(false);
        this.showToast('⚠️ 匯率載入失敗，請確認後端連線');
      },
    });
  }

  /* ── 匯率：依日期查詢 ───────────────────────────── */
  loadRatesByDate(): void {
    const d = this.rateQueryDate();
    if (!d) {
      this.loadAllRates();
      return;
    }
    this.rateError.set(null);
    this.ratesLoading.set(true);
    this.apiService.getRatesByDate({ date: d }).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.allRates.set([]);
          this.rateError.set(this.getApiErrorMessage(res, '日期查詢失敗'));
          this.ratesLoading.set(false);
          return;
        }

        this.allRates.set(this.normalizeRates(res?.exchangeRatesList ?? []));
        this.ratesLoading.set(false);
      },
      error: () => {
        this.allRates.set([]);
        this.rateError.set('日期查詢失敗，請確認日期與後端連線');
        this.ratesLoading.set(false);
        this.showToast('⚠️ 查詢失敗，請確認日期與後端連線');
      },
    });
  }

  private normalizeRates(rates: ExchangeRateVO[]): ExchangeRateVO[] {
    return rates
      .map((r) => ({
        ...r,
        currencyCode: r.currencyCode?.toUpperCase() ?? '',
        rateToTwd: Number(r.rateToTwd),
      }))
      .filter((r) => r.currencyCode && Number.isFinite(r.rateToTwd))
      .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
  }

  formatRate(value: number): string {
    return new Intl.NumberFormat('zh-TW', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    }).format(value);
  }

  formatRateUpdatedAt(value: string): string {
    if (!value) return '—';
    return value.replace('T', ' ').slice(0, 19);
  }

  /* ── 商品篩選 ─────────────────────────────────── */
  onProductStyleFilter(event: Event): void {
    this.productStyleFilter.set((event.target as HTMLSelectElement).value);
  }

  onProductCategoryFilter(event: Event): void {
    this.productCategoryFilter.set((event.target as HTMLSelectElement).value);
  }

  onProductSearch(event: Event): void {
    this.productSearch.set((event.target as HTMLInputElement).value);
  }

  /* ── Modal 關閉 ─────────────────────────────────────── */
  closeModal(): void {
    this.activeModal.set(null);
    this.editingProductId.set(null);
    this.newStaffResult.set(null);
  }

  /* ── 新增 / 編輯商品 Modal ─────────────────────────── */
  openAddProduct(): void {
    this.editingProductId.set(null);

    this.productDraft = {
      name: '',
      category: '',
      style: '',
      description: '',
      active: true,
    };

    this.customProductStyle = '';
    this.customProductCategory = '';

    this.productImageFile = null;
    this.productImagePreview.set('');

    this.refreshProductOptionLists();
    this.activeModal.set('addProduct');
  }

  openEditProduct(id: number): void {
    const p = this.products().find((x) => x.id === id);
    if (!p) return;

    this.editingProductId.set(id);

    this.productDraft = {
      name: p.name,
      category: p.category || '',
      style: p.style || '',
      description: p.description || '',
      active: p.isActive,
    };

    this.customProductStyle = '';
    this.customProductCategory = '';

    this.ensureProductOptionExists('style', this.productDraft.style);
    this.ensureProductOptionExists('category', this.productDraft.category);

    this.productImageFile = null;
    this.productImagePreview.set(p.foodImgBase64 || '');

    this.refreshProductOptionLists();
    this.activeModal.set('addProduct');

    this.apiService.getProductDetail(id).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.showToast(this.getApiErrorMessage(res, '⚠️ 商品詳情載入失敗'));
          return;
        }

        if (!res?.product) return;

        const product = res.product;
        const style = product.style || this.productDraft.style;
        const category = product.category || this.productDraft.category;

        this.ensureProductOptionExists('style', style);
        this.ensureProductOptionExists('category', category);

        this.productDraft = {
          ...this.productDraft,
          name: product.name || this.productDraft.name,
          description: product.description ?? '',
          category,
          style,
          active: product.active ?? this.productDraft.active,
        };

        if (product.foodImgBase64) {
          this.productImagePreview.set(this.toImg(product.foodImgBase64));
        }
      },
      error: () => {
        this.showToast('⚠️ 商品詳細資料載入失敗');
      },
    });
  }

  onProductImageChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.productImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) =>
      this.productImagePreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  generateAiDesc(): void {
    const productName = this.productDraft.name.trim();

    if (!productName) {
      this.showToast('⚠️ 請先填寫商品名稱');
      return;
    }

    if (!this.productDraft.category.trim()) {
      this.showToast('⚠️ 請先選擇或填寫餐點分類');
      return;
    }

    if (!this.productDraft.style.trim()) {
      this.showToast('⚠️ 請先選擇或填寫料理風格');
      return;
    }

    if (!this.productImageFile) {
      this.showToast('⚠️ 請先上傳商品圖片，AI 需要圖片才能生成描述');
      return;
    }

    this.generatingAiDesc.set(true);

    this.apiService
      .generateAiProductDesc(
        {
          productid: undefined,
          productName,
          category: this.productDraft.category.trim(),
          style: this.productDraft.style.trim(),
        },
        this.productImageFile,
      )
      .subscribe({
        next: (res: AiRes) => {
          if (!this.isSuccessRes(res)) {
            this.showToast(this.getApiErrorMessage(res, '⚠️ AI 生成失敗'));
            this.generatingAiDesc.set(false);
            return;
          }

          this.productDraft.description = res?.generatedDescription ?? '';
          this.generatingAiDesc.set(false);
        },
        error: () => {
          this.showToast('⚠️ AI 生成失敗');
          this.generatingAiDesc.set(false);
        },
      });
  }

  generatePromoAiDesc(): void {
    if (!this.promoDraft.name.trim()) {
      this.showToast('⚠️ 請先填寫活動名稱');
      return;
    }

    if (!this.promoDraft.image) {
      this.showToast('⚠️ 請先上傳封面圖片才能 AI 生成文案');
      return;
    }

    if (!this.promoDraft.giftProductId || this.promoDraft.giftProductId <= 0) {
      this.showToast('⚠️ 請先選擇贈品商品');
      return;
    }

    if (!this.promoDraft.giftFullAmount || this.promoDraft.giftFullAmount <= 0) {
      this.showToast('⚠️ 請先填寫滿額門檻');
      return;
    }

    this.generatingPromoAiDesc.set(true);

    const base64 = this.promoDraft.image.startsWith('data:')
      ? this.promoDraft.image.split(',')[1]
      : this.promoDraft.image;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: 'image/jpeg' });

    this.apiService
      .generateAiPromoCopy(
        {
          promotionsId: 0,
          activityName: this.promoDraft.name.trim(),
          promotionItems: [
            {
              productId: Number(this.promoDraft.giftProductId),
              fullAmount: Number(this.promoDraft.giftFullAmount),
            },
          ],
        },
        blob,
      )
      .subscribe({
        next: (res: AiRes) => {
          if (!this.isSuccessRes(res)) {
            this.showToast(this.getApiErrorMessage(res, '❌ AI 生成失敗'));
            this.generatingPromoAiDesc.set(false);
            return;
          }

          this.promoDraft.description = res?.generatedDescription ?? '';
          this.generatingPromoAiDesc.set(false);
        },
        error: () => {
          this.showToast('❌ AI 生成失敗，請確認後端連線');
          this.generatingPromoAiDesc.set(false);
        },
      });
  }

  saveProduct(): void {
    const editingId = this.editingProductId();
    const finalStyle = this.getFinalProductStyle();
    const finalCategory = this.getFinalProductCategory();

    if (!this.productDraft.name.trim()) {
      this.showToast('⚠️ 請填寫商品名稱');
      return;
    }

    if (!finalStyle) {
      this.showToast('⚠️ 請選擇或輸入料理風格');
      return;
    }

    if (!finalCategory) {
      this.showToast('⚠️ 請選擇或輸入餐點分類');
      return;
    }

    if (editingId === null && !this.productImageFile) {
      this.showToast('⚠️ 新增商品需要上傳圖片');
      return;
    }

    const req = {
      name: this.productDraft.name.trim(),
      category: finalCategory,
      style: finalStyle,
      description: this.productDraft.description?.trim() || '',
      active: this.productDraft.active,
    };

    const request$ =
      editingId === null
        ? this.apiService.createProduct(req, this.productImageFile ?? undefined)
        : this.apiService.updateProduct(
          { id: editingId, ...req },
          this.productImageFile ?? undefined,
        );

    request$.subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.showToast(`⚠️ 儲存失敗：${this.getApiErrorMessage(res, '請稍後再試')}`);
          return;
        }

        this.ensureProductOptionExists('style', finalStyle);
        this.ensureProductOptionExists('category', finalCategory);

        this.refreshProductOptionLists();
        this.loadProducts();
        this.resetProductFilters();
        this.closeModal();

        this.showToast(editingId === null ? '✅ 商品已新增' : '✅ 商品已更新');
      },
      error: () => {
        this.showToast('⚠️ 儲存失敗，請確認後端連線');
      },
    });
  }

  /* ── 新增活動 Slide-in Panel ───────────────────────── */
  openAddPromo(): void {
    this.promoDraft = {
      name: '',
      description: '',
      startTime: '',
      endTime: '',
      image: '',
      giftFullAmount: null,
      giftProductId: null,
      giftQuantity: -1,
    };
    if (this.giftProductList().length === 0) {
      this.apiService.getAllProducts().subscribe({
        next: (res) => {
          if (!this.isSuccessRes(res)) {
            this.showToast(this.getApiErrorMessage(res, '⚠️ 贈品商品清單載入失敗'));
            return;
          }

          this.giftProductList.set(
            (res?.productList ?? []).filter(p => p.active),
          );
        },
      });
    }
    this.showPromoPanel.set(true);
  }

  closePromoPanel(): void {
    this.showPromoPanel.set(false);
  }

  onPromoImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.promoDraft.image = e.target?.result as string;
    };
    reader.readAsDataURL(input.files[0]);
  }

  savePromo(): void {
    const name = this.promoDraft.name.trim();
    const description = this.promoDraft.description.trim();
    const startTime = this.promoDraft.startTime;
    const endTime = this.promoDraft.endTime;
    const image = this.promoDraft.image;
    const fullAmount = Number(this.promoDraft.giftFullAmount);
    const giftProductId = Number(this.promoDraft.giftProductId);
    const quantity = Number(this.promoDraft.giftQuantity);

    if (!image) {
      this.showToast('請上傳活動封面圖片（必填）');
      return;
    }

    if (!name) {
      this.showToast('請輸入活動名稱');
      return;
    }

    if (!fullAmount || fullAmount <= 0) {
      this.showToast('⚠️ 請填寫贈品規則的滿額門檻');
      return;
    }

    if (!giftProductId || giftProductId <= 0) {
      this.showToast('⚠️ 請選擇贈品商品');
      return;
    }

    if (quantity === 0 || quantity < -1) {
      this.showToast('⚠️ 贈品數量請輸入 -1 或大於 0 的正整數');
      return;
    }

    if (!startTime || !endTime) {
      this.showToast('請填寫活動開始與結束日期');
      return;
    }

    if (startTime > endTime) {
      this.showToast('⚠️ 開始日期不能晚於結束日期');
      return;
    }

    if (!description) {
      this.showToast('請輸入活動描述');
      return;
    }

    const req: PromotionsManageReq = {
      active: true,
      fullAmount,
      endTime,
      quantity,
      promotionsId: 0,
      name,
      startTime,
      giftProductId,
      description,
    };

    this.apiService.createPromotion(req, image).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.showToast(this.getApiErrorMessage(res, '活動新增失敗'));
          return;
        }

        this.loadPromos();
        this.closePromoPanel();
        this.showToast(`活動「${name}」已新增`);
      },
      error: () => {
        this.showToast('活動新增失敗，請確認後端服務是否正常');
      },
    });
  }

  /* ── 新增 / 編輯帳號 Modal ─────────────────────────── */
  openAddAccount(): void {
    this.editingAccountId.set(null);
    const firstBranch = this.branches()[0];
    const country = firstBranch?.country ?? '';
    this.accountModalCountry.set(country);
    const subTab = this.userSubTab();
    const defaultRole: 'bm' | 'ma' | 'staff' =
      subTab === 'bm' ? 'bm' : subTab === 'ma' ? 'ma' : 'staff';
    this.accountDraft = {
      name: '',
      account: '',
      password: '',
      branch: firstBranch?.name ?? '',
      shift: '早班',
      role: defaultRole,
      isActive: true,
      country,
    };
    this.activeModal.set('addAccount');
  }

  onAccountCountryChange(country: string): void {
    this.accountModalCountry.set(country);
    const match = this.branches().find((b) => b.country === country);
    if (match) this.accountDraft.branch = match.name;
  }

  openEditAccount(id: number): void {
    const acc = this.accounts().find((a) => a.id === id);
    if (!acc) return;
    this.editingAccountId.set(id);
    const country = acc.country ?? '';
    this.accountModalCountry.set(country);
    this.accountDraft = {
      name: acc.name,
      account: acc.account,
      password: '',
      branch: acc.branch ?? '',
      shift: acc.shift ?? '早班',
      role: acc.role,
      isActive: acc.isActive,
      country,
    };
    this.activeModal.set('addAccount');
  }

  saveAccount(): void {
    if (!this.accountDraft.name.trim()) {
      this.showToast('⚠️ 姓名為必填');
      return;
    }
    const editId = this.editingAccountId();
    const savedName = this.accountDraft.name;
    if (editId !== null) {
      this.accounts.update((list) =>
        list.map((a) =>
          a.id === editId
            ? {
              ...a,
              name: this.accountDraft.name,
              branch: this.accountDraft.branch,
              shift:
                this.accountDraft.role === 'staff'
                  ? this.accountDraft.shift
                  : undefined,
              role: this.accountDraft.role,
              isActive: this.accountDraft.isActive,
              country: this.accountDraft.country,
            }
            : a,
        ),
      );
      this.closeModal();
      this.showToast(`✅ 帳號「${savedName}」已更新`);
    } else {
      const globalAreaId =
        this.branches().find((b) => b.name === this.accountDraft.branch)?.id ??
        1;
      const backendRole =
        this.accountDraft.role === 'bm' ? 'REGION_MANAGER'
          : this.accountDraft.role === 'ma' ? 'MANAGER_AGENT'
            : 'STAFF';
      this.apiService
        .createStaff({
          name: this.accountDraft.name,
          role: backendRole,
          globalAreaId,
        })
        .subscribe({
          next: (res) => {
            if (!this.isSuccessRes(res)) {
              this.showToast(this.getApiErrorMessage(res, '⚠️ 新增失敗'));
              return;
            }

            this.loadStaff();
            const created = res?.staffList?.[0];
            if (created?.account) {
              this.newStaffResult.set({
                name: created.name,
                account: created.account,
              });
            } else {
              this.closeModal();
              this.showToast(`✅ 帳號「${savedName}」已新增`);
            }
          },
          error: () => this.showToast('⚠️ 新增失敗，請確認後端連線'),
        });
    }
  }

  confirmNewStaff(): void {
    this.newStaffResult.set(null);
    this.closeModal();
  }

  /* ── 新增國家稅率 Modal ─────────────────────────────── */
  openAddCountry(): void {
    this.taxDraft = {
      country: '',
      countryCode: '',
      currency: '',
      taxType: 'INCLUSIVE',
      rate: 0,
    };
    this.activeModal.set('addCountry');
  }

  saveCountry(): void {
    if (!this.taxDraft.country.trim()) {
      this.showToast('請輸入國家／地區名稱');
      return;
    }
    const saved = { ...this.taxDraft };
    const currencyMap: Record<string, string> = {
      台灣: 'TWD',
      日本: 'JPY',
      泰國: 'THB',
      韓國: 'KRW',
      美國: 'USD',
      英國: 'GBP',
      法國: 'EUR',
      德國: 'EUR',
      新加坡: 'SGD',
      馬來西亞: 'MYR',
      印尼: 'IDR',
      越南: 'VND',
    };
    const resolvedCurrency =
      saved.currency.trim() || currencyMap[saved.country.trim()] || 'USD';
    const taxTypeLabel = saved.taxType === 'INCLUSIVE' ? '內含稅' : '外加稅';
    this.apiService
      .insertRegion({
        country: saved.country.trim(),
        countryCode: saved.countryCode.trim().toUpperCase(),
        currencyCode: resolvedCurrency,
        taxRate: saved.rate / 100,
        taxType: saved.taxType as 'INCLUSIVE' | 'EXCLUSIVE',
        // 不帶 usageCap：國家設定與會員折扣上限獨立管理，
        // 折扣記錄請至「會員設定」頁籤單獨新增
      })
      .subscribe({
        next: (res) => {
          if (!this.isSuccessRes(res)) {
            this.showToast(this.getApiErrorMessage(res, '⚠️ 新增國家失敗'));
            return;
          }

          this.loadTaxes();
          this.closeModal();
          this.showToast(
            `已新增 ${saved.country}（${resolvedCurrency}）${taxTypeLabel} ${saved.rate}%`,
          );
        },
        error: () => {
          const ids = this.taxes().map((t) => t.id);
          const newId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
          this.taxes.update((list) => [
            ...list,
            {
              id: newId,
              country: saved.country,
              countryCode: saved.countryCode.trim().toUpperCase(),
              currency: resolvedCurrency,
              taxType: saved.taxType,
              rate: saved.rate,
              discountLimit: 0,
              editing: false,
              editRate: saved.rate,
              editTaxType: saved.taxType,
              editDiscountLimit: 0,
            },
          ]);
          this.closeModal();
          this.showToast(
            `後端暫不可用，已本地新增 ${saved.country}（${resolvedCurrency}）`,
          );
        },
      });
  }

  /* ── 財務報表：查詢入口 ─────────────────────────── */
  formatChartMonth(ym: string): string {
    return `${+ym.slice(5)}月`;
  }

  abbreviateNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return `${Math.round(n)}`;
  }


  /* ── 分店：輔助 — 依 regionsId 查國家名稱 ────────── */
  getBranchCountryName(regionsId: number): string {
    return this.taxes().find((t) => t.id === regionsId)?.country ?? '';
  }

  /* ── 分店：新增 Modal ─────────────────────────────── */
  openAddBranch(): void {
    this.branchDraft = { regionsId: 0, branch: '', address: '', phone: '' };
    this.activeModal.set('addBranch');
  }

  saveBranch(): void {
    if (!this.branchDraft.regionsId) {
      this.showToast('⚠️ 請選擇國家');
      return;
    }

    if (!this.branchDraft.branch.trim()) {
      this.showToast('⚠️ 請填寫分店名稱');
      return;
    }

    if (!this.branchDraft.address.trim()) {
      this.showToast('⚠️ 請填寫分店地址');
      return;
    }

    if (!this.branchDraft.phone.trim()) {
      this.showToast('⚠️ 請填寫分店電話');
      return;
    }

    const saved = { ...this.branchDraft };
    const branchName = saved.branch.trim();

    this.apiService
      .createBranch({
        regionsId: saved.regionsId,
        branch: branchName,
        address: saved.address.trim(),
        phone: saved.phone.trim(),
      })
      .subscribe({
        next: (res) => {
          if (!this.isSuccessRes(res)) {
            this.showToast(
              `⚠️ 新增失敗：${this.getApiErrorMessage(res, '請確認電話格式是否正確')}`,
            );
            return;
          }

          this.loadBranches();
          this.closeModal();
          this.showToast(`✅ 分店「${branchName}」已新增`);
        },
        error: () => {
          this.showToast('⚠️ 後端連線失敗，請確認伺服器是否啟動');
        },
      });
  }

  /* ── 分店：編輯 Modal ─────────────────────────────── */
  openEditBranch(id: number): void {
    const b = this.branches().find((x) => x.id === id);
    if (!b) return;
    this.editBranchDraft = {
      id: b.id,
      regionsId: b.regionsId,
      branch: b.name,
      address: b.address,
      phone: b.phone,
    };
    this.activeModal.set('editBranch');
  }

  saveEditBranch(): void {
    if (!this.editBranchDraft.regionsId) {
      this.showToast('⚠️ 請選擇國家');
      return;
    }

    if (!this.editBranchDraft.branch.trim()) {
      this.showToast('⚠️ 請填寫分店名稱');
      return;
    }

    if (!this.editBranchDraft.address.trim()) {
      this.showToast('⚠️ 請填寫分店地址');
      return;
    }

    if (!this.editBranchDraft.phone.trim()) {
      this.showToast('⚠️ 請填寫分店電話');
      return;
    }

    const saved = { ...this.editBranchDraft };
    const branchName = saved.branch.trim();

    this.apiService
      .updateBranch({
        id: saved.id,
        regionsId: saved.regionsId,
        branch: branchName,
        address: saved.address.trim(),
        phone: saved.phone.trim(),
      })
      .subscribe({
        next: (res) => {
          if (!this.isSuccessRes(res)) {
            this.showToast(
              `⚠️ 更新失敗：${this.getApiErrorMessage(res, '請確認電話格式是否正確')}`,
            );
            return;
          }

          this.loadBranches();
          this.closeModal();
          this.showToast(`✅ 分店「${branchName}」已更新`);
        },
        error: () => {
          this.showToast('⚠️ 後端連線失敗，請確認伺服器是否啟動');
        },
      });
  }

  /* ── 分店：刪除確認 Modal ────────────────────────── */

  /** 檢查指定分店底下是否仍有員工帳號 */
  private getAccountsByBranchName(branchName: string): DashAccount[] {
    return this.accounts().filter((acc) => acc.branch === branchName);
  }

  deleteBranchConfirm = signal<{ id: number; name: string } | null>(null);

  requestDeleteBranch(id: number): void {
    const b = this.branches().find((x) => x.id === id);
    if (!b) return;

    const relatedAccounts = this.getAccountsByBranchName(b.name);

    if (relatedAccounts.length > 0) {
      this.showToast(
        `⚠️ 無法刪除「${b.name}」，此分店仍有 ${relatedAccounts.length} 個帳號，請先調換分店。`,
      );
      return;
    }

    this.deleteBranchConfirm.set({ id, name: b.name });
  }

  confirmDeleteBranch(): void {
    const target = this.deleteBranchConfirm();
    if (!target) return;
    this.deleteBranchConfirm.set(null);
    this.apiService.deleteBranch({ globalAreaIdList: [target.id] }).subscribe({
      next: (res) => {
        if (!this.isSuccessRes(res)) {
          this.showToast(this.getApiErrorMessage(res, `⚠️ 分店「${target.name}」刪除失敗`));
          return;
        }

        this.branches.update((list) => list.filter((x) => x.id !== target.id));
        this.showToast(`🗑️ 分店「${target.name}」已刪除`);
      },
      error: () => {
        this.branches.update((list) => list.filter((x) => x.id !== target.id));
        this.showToast(`⚠️ 後端暫不可用，僅本地移除分店「${target.name}」`);
      },
    });
  }

  cancelDeleteBranch(): void {
    this.deleteBranchConfirm.set(null);
  }
}
