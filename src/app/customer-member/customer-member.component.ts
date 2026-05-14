/*
 * =====================================================
 * 檔案名稱：customer-member.component.ts
 * 位置說明：src/app/customer-member/customer-member.component.ts
 * 用途說明：客戶會員中心頁面的邏輯
 * 功能說明：
 *   - 顯示會員基本資料（名稱、手機、電子郵件、密碼）
 *   - 切換「檢視模式」與「編輯模式」
 *   - 左右（桌機）/ 上下（手機）雙欄版面：同時顯示基本資料與訂單紀錄
 *   - 登入驗證守衛（未登入者自動跳回登入頁）
 *   - 登出功能
 * Angular 知識點：
 *   - OnInit  生命週期鉤子，元件初始化時執行 ngOnInit()
 *             用來做登入狀態檢查（保護此頁面）
 *   - Router  切換頁面（導覽到登入頁或管理系統）
 *   - AuthService  取得目前登入的使用者資料
 *   - LoadingService  切換到管理系統時顯示 Loading
 * =====================================================
 */

import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';

import { AuthService } from '../shared/auth.service';
import { LoadingService } from '../shared/loading.service';

import { ApiService, GetOrdersVo } from '../shared/api.service';

@Component({
  selector: 'app-customer-member',
  standalone: true,
  imports: [
    FormsModule,
    NgClass,
  ],
  templateUrl: './customer-member.component.html',
  styleUrls: ['./customer-member.component.scss'],
})
export class CustomerMemberComponent implements OnInit {
  /* ── 編輯模式狀態 ─────────────────────────────────
     isEditing = false → 顯示資料（檢視模式）
     isEditing = true  → 顯示輸入框（編輯模式）
  ────────────────────────────────────────────────── */
  isEditing: boolean = false;

  /* 編輯中的暫存值（不影響原始資料，直到按下儲存） */
  editName: string = '';
  editPhone: string = '';
  editPassword: string = ''; /* 留空代表不修改密碼 */

  /* 儲存成功提示訊息（顯示 2 秒後自動消失） */
  saveSuccess: boolean = false;

  orders: GetOrdersVo[] = [];
  ordersLoading = false;

  /*
   * constructor 建構函式
   * 注入需要用到的服務：
   *   router         → 頁面導覽（保護守衛、登出跳轉）
   *   authService    → 讀取/更新目前登入的使用者資料（public：HTML 模板也能讀取）
   *   loadingService → 切換到管理系統時的 Loading 動畫
   */
  constructor(
    private router: Router,
    public authService: AuthService,
    private loadingService: LoadingService,
    private apiService: ApiService, // ← 新增
  ) {}

  editOldPassword: string = '';
  showOldPwd = false;
  showNewPwd = false;
  toggleOldPwd(): void { this.showOldPwd = !this.showOldPwd; }
  toggleNewPwd(): void { this.showNewPwd = !this.showNewPwd; }
  /*
   * ngOnInit：元件初始化時自動執行
   * ① 登入保護：沒有登入的人直接踢回登入頁
   * ② 載入訂單資料
   */
  ngOnInit(): void {
    /* ① 登入保護 */
    if (!this.authService.currentUser) {
      this.router.navigate(['/customer-login']);
      return;
    }

    /* ② 載入訂單資料 */
    const memberId = this.authService.currentMember?.members?.id
                  ?? this.authService.currentUser?.id
                  ?? 0;
    if (memberId > 0) {
      this.ordersLoading = true;
      this.apiService.getAllOrders({ memberId }).subscribe({
        next: (res) => {
          this.orders = res.getOrderVoList ?? [];
          this.ordersLoading = false;
        },
        error: () => { this.ordersLoading = false; },
      });
    }
  }

  /* ── 進入編輯模式 ─────────────────────────────────
     將目前的使用者資料複製到暫存欄位，再開啟編輯模式
     這樣使用者取消時，原始資料不會被破壞
  ────────────────────────────────────────────────── */
  startEdit(): void {
    if (this.authService.currentUser) {
      this.editName = this.authService.currentUser.name;
      this.editPhone = this.phoneToLocal(this.authService.currentUser.phone);
      this.editPassword = ''; /* 密碼欄預設留空（不修改） */
      this.editOldPassword = ''; // ← 新增
    }
    this.isEditing = true;
  }

  /* ── 取消編輯 ─────────────────────────────────────
     清空暫存欄位，回到檢視模式
  ────────────────────────────────────────────────── */
  cancelEdit(): void {
    this.editName = '';
    this.editPhone = '';
    this.editPassword = '';
    this.editOldPassword = ''; // ← 新增
    this.isEditing = false;
  }

  /* ── 儲存編輯 ─────────────────────────────────────
     呼叫 authService 更新資料，顯示成功提示後回到檢視模式
  ────────────────────────────────────────────────── */
  // saveEdit() 完整改寫
  saveEdit(): void {
    if (this.editName.trim().length === 0) return;

    const memberId = this.authService.currentUser?.id ?? 0;

    // 有填新密碼時才呼叫後端修改密碼 API
    if (this.editPassword.trim().length > 0) {
      if (this.editOldPassword.trim().length === 0) {
        alert('請輸入舊密碼');
        return;
      }
      this.apiService
        .updateMemberPassword({
          id: memberId,
          oldPassword: this.editOldPassword.trim(),
          newPassword: this.editPassword.trim(),
        })
        .subscribe({
          next: (res) => {
            if (res.code !== 200) {
              alert('密碼錯誤，請確認目前密碼');
              return;
            }
            this._finishSave();
          },
          error: () => alert('密碼修改失敗，請稍後再試'),
        });
    } else {
      // 不改密碼，只更新名稱
      this._finishSave();
    }
  }

  private _finishSave(): void {
    this.authService.updateProfile(
      this.editName.trim(),
      this.authService.currentUser?.phone ?? '', // phone 唯讀，不允許修改
      '', // 不傳密碼，authService.updateProfile 的密碼邏輯不再用
    );
    this.isEditing = false;
    this.editOldPassword = '';
    this.saveSuccess = true;
    setTimeout(() => {
      this.saveSuccess = false;
    }, 2000);
  }

  /* ── 登出 ─────────────────────────────────────────
     清除登入狀態後跳回客戶登入頁
  ────────────────────────────────────────────────── */
  logout(): void {
    this.authService.logout();
    this.router.navigate(['/customer-login']);
  }

  /* ── 切換到管理系統（含 Loading）─────────────────
     與 customer-login 相同的流程：先 Loading，再導覽
  ────────────────────────────────────────────────── */
  goToStaff(): void {
    this.loadingService.showStaffLoading();
    setTimeout(() => {
      this.router.navigate(['/staff-login']).then(() => {
        this.loadingService.hide();
      });
    }, 1500);
  }

  /** +886XXXXXXXXX → 0XXXXXXXXX（台灣），其他國碼原樣返回 */
  phoneToLocal(phone: string | undefined | null): string {
    if (!phone) return '';
    if (phone.startsWith('+886')) return '0' + phone.slice(4);
    return phone;
  }

  /* ── 取得頭像顯示文字 ─────────────────────────────
     取名稱第一個字當作頭像縮寫（例：「懶飽飽測試會員」→「懶」）
  ────────────────────────────────────────────────── */
  getAvatarLetter(): string {
    if (
      this.authService.currentUser &&
      this.authService.currentUser.name.length > 0
    ) {
      return this.authService.currentUser.name.charAt(0);
    }
    return '?';
  }

  getOrderStatusText(status: string): string {
    const map: Record<string, string> = {
      PICKED_UP: '已完成',
      COOKING: '備餐中',
      READY: '可取餐',
      CANCELLED: '已取消',
      REFUNDED: '已退款',
    };
    return map[status] ?? status;
  }

  getOrderStatusClass(status: string): string {
    if (status === 'PICKED_UP') return 'status-done';
    if (status === 'COOKING' || status === 'READY') return 'status-cooking';
    if (status === 'CANCELLED' || status === 'REFUNDED') return 'status-cancelled';
    return '';
  }

  getOrderDate(order: GetOrdersVo): string {
    if (order.completedAt) return order.completedAt.slice(0, 10);
    if (order.orderDateId) {
      const d = order.orderDateId;
      return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    }
    return '—';
  }

  getOrderItems(order: GetOrdersVo): string {
    const details = order.getOrdersDetailVoList ?? order.GetOrdersDetailVoList ?? [];
    const mainItems = details.filter((d) => !d.gift);
    if (!mainItems.length) return '—';
    return mainItems.map((d) => `${d.productName ?? d.name ?? '?'} × ${d.quantity}`).join('、');
  }
}
