/*
 * =====================================================
 * 檔案名稱：auth.service.ts
 * 位置說明：src/app/shared/auth.service.ts
 * 用途說明：暫時性的假帳號驗證服務（前端 Mock 版本）
 *
 * ⚠ 重要說明：
 *   此服務的所有帳號資料都是假的（hardcoded），
 *   等未來串接 MySQL 後端後，請將 login()、getOrders()、updateProfile()
 *   全部替換成 HttpClient 的 API 呼叫，帳號陣列也要全部移除。
 *
 * 未來帳號角色規劃（預留欄位 role）：
 *   'boss'           → 老闆 / 總經理（最高權限）
 *   'branch_manager' → 分店長（可能多國，需綁定 branchId）
 *   'staff'          → 員工（可能多國，需綁定 branchId）
 *   'customer'       → 一般會員 / 訪客
 *
 * TypeScript 知識點：
 *   interface → 型別介面，定義物件的屬性結構（不會被編譯成 JS，純型別檢查用）
 *   export    → 讓其他檔案可以 import 這個型別定義
 * =====================================================
 */

import { Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService, LoginMembersReq, LoginStaffReq, MembersRes, StaffSearchRes } from './api.service';
import { BranchService } from './branch.service';


/* ── 使用者帳號的資料結構定義 ──────────────────────────
   ? 問號表示「可選屬性」，這個屬性可以不存在
──────────────────────────────────────────────────── */
export interface MockUser {
  id: number;
  role: string;       /* 身分類型：'customer' | 'staff' | 'branch_manager' | 'deputy_manager' | 'boss' | 'guest' */
  name: string;       /* 顯示名稱 */
  phone: string;      /* 手機號碼 */
  email: string;      /* 電子郵件 */
  password: string;   /* ⚠ 暫時明文，未來串接後端需改為 hash 驗證 */
  isGuest?: boolean;  /* 是否為訪客（無需帳號，只需手機號碼） */
}


/* ── 員工資料結構（串接後端後使用）──────────────────── */
export interface StaffUser {
  id: number;
  role: string;   /* ADMIN / REGION_MANAGER / MANAGER_AGENT / STAFF */
  name: string;
  account: string;
  globalAreaId: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  /* 目前登入中的員工（後端 Session 驗證後儲存）*/
  currentStaff: StaffUser | null = (() => {
    try {
      const saved = sessionStorage.getItem('currentStaff');
      return saved ? JSON.parse(saved) as StaffUser : null;
    } catch { return null; }
  })();

  /*
   * 目前登入中的使用者
   * null  = 尚未登入（未驗證狀態）
   * MockUser = 已成功登入的使用者物件
   *
   * 初始化時從 sessionStorage 還原登入狀態，
   * 讓使用者重新整理頁面後不需要重新登入。
   * sessionStorage 會在瀏覽器分頁關閉後自動清除。
   *
   * ⚠ TODO [API串接點]：串接後端後改為驗證 JWT token，
   *   不再使用 sessionStorage 儲存使用者物件
   */
  /* 目前登入中的客戶（MockUser 保留向後相容，真實登入資料存 currentMember）*/
  currentMember: MembersRes | null = (() => {
    try {
      const saved = sessionStorage.getItem('currentMember');
      return saved ? JSON.parse(saved) as MembersRes : null;
    } catch { return null; }
  })();

  /** true 時代表後端 Session 已過期，顯示重登入 Modal */
  sessionExpired = signal<boolean>(false);

  currentUser: MockUser | null = (() => {
    try {
      const saved = sessionStorage.getItem('currentUser');
      return saved ? JSON.parse(saved) as MockUser : null;
    } catch {
      return null;
    }
  })();


  constructor(private apiService: ApiService, private branchService: BranchService) {}

  /* ── 會員登入（真實後端版本）───────────────────────
   * 呼叫後端 POST members/login，由後端 Session 管理狀態
   * 回傳 Observable<MembersRes>，讓元件訂閱並處理結果
   * ────────────────────────────────────────────────── */
  loginMember(phone: string, password: string): Observable<MembersRes> {
    const req: LoginMembersReq = { phone, password, regionsId: this.branchService.regionsId };
    return this.apiService.memberLogin(req).pipe(
      tap(res => {
        if (res.code === 200) {
          // 將 members 嵌套欄位提升到頂層，讓元件可直接讀 currentMember.orderCount / isDiscount
          if (res.members?.orderCount != null) res.orderCount = res.members.orderCount;
          if (res.members?.discount != null)   res.isDiscount = res.members.discount;
          this.currentMember = res;
          sessionStorage.setItem('currentMember', JSON.stringify(res));
          // 同步更新 currentUser 以維持向後相容（舊元件讀 currentUser）
          const m = res.members;
          if (m?.id) {
            this.currentUser = {
              id: m.id,
              role: 'customer',
              name: m.name ?? '',
              phone: m.phone ?? phone,
              email: '',
              password: ''
            };
            sessionStorage.setItem('currentUser', JSON.stringify(this.currentUser));
          }
        }
      })
    );
  }

  /* ── 員工登入（真實後端版本）───────────────────────
   * 呼叫後端 POST api/auth/login，由後端 Session 管理狀態
   * 回傳 Observable<StaffSearchRes>，讓元件訂閱並處理結果
   * ────────────────────────────────────────────────── */
 loginStaffApi(account: string, password: string): Observable<StaffSearchRes> {
  const req: LoginStaffReq = { account, password };
  return this.apiService.staffLogin(req).pipe(
    tap(res => {
      if (res.code === 200 && res.staffList && res.staffList.length > 0) {
        const staff = res.staffList[0];
        const staffUser: StaffUser = {
          id: staff.id,
          role: staff.role,
          name: staff.name,
          account: staff.account,
          globalAreaId: staff.globalAreaId
        };
        this.currentStaff = staffUser;
        sessionStorage.setItem('currentStaff', JSON.stringify(staffUser));

        this.currentUser = {
          id: staff.id,
          role: this.mapStaffRole(staff.role),
          name: staff.name,
          phone: '',
          email: staff.account,
          password: ''
        };
        sessionStorage.setItem('currentUser', JSON.stringify(this.currentUser));

        // mustChangePassword 存入 sessionStorage 供登入頁讀取
        if (res.mustChangePassword) {
          sessionStorage.setItem('mustChangePassword', 'true');
        } else {
          sessionStorage.removeItem('mustChangePassword');
        }
      }
    })
  );
}

  get needsPasswordChange(): boolean {
    return sessionStorage.getItem('mustChangePassword') === 'true';
  }

  clearPasswordChangeFlag(): void {
    sessionStorage.removeItem('mustChangePassword');
  }

  /* 將後端 role 字串轉換為前端舊版 role 字串（向後相容）*/
  private mapStaffRole(backendRole: string): string {
    const map: Record<string, string> = {
      'ADMIN': 'boss',
      'REGION_MANAGER': 'branch_manager',
      'MANAGER_AGENT': 'deputy_manager',
      'STAFF': 'staff'
    };
    return map[backendRole] ?? 'staff';
  }

  /* ── 登出（清除所有 Session 狀態）─────────────────
   * 同時呼叫後端 logout，清除 Server-side Session
   * ─────────────────────────────────────────────────*/
logout(): void {
  const wasStaff = this.currentStaff !== null;  // 登出前先記住身分

  this.currentUser = null;
  this.currentMember = null;
  this.currentStaff = null;
  sessionStorage.removeItem('currentUser');
  sessionStorage.removeItem('currentMember');
  sessionStorage.removeItem('currentStaff');

  // ✅ 只有員工才呼叫 staff 登出 API
  if (wasStaff) {
    this.apiService.staffLogout().subscribe({ error: () => {} });
  } else {
      this.apiService.memberLogout().subscribe({ error: () => {} });

  }
}

  /** 後端 Session 過期（401）時由 HttpInterceptor 呼叫 */
  handleSessionExpired(): void {
    this.currentUser = null;
    this.currentMember = null;
    this.currentStaff = null;
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentMember');
    sessionStorage.removeItem('currentStaff');
    this.sessionExpired.set(true);
  }

  /** 重登入 Modal 關閉或登入成功後呼叫 */
  clearSessionExpired(): void {
    this.sessionExpired.set(false);
  }


  /*
   * ── 訪客登入（暫時版本）────────────────────────────
   * 不需要帳號密碼，只需手機號碼，以訪客身份進入點餐
   * 未來替換：可在後端建立暫時 session 紀錄訪客行為
   * ─────────────────────────────────────────────────*/
  loginAsGuest(phone: string): void {
    const guest: MockUser = {
      id: 0,
      role: 'guest',
      name: '訪客',
      phone: phone,
      email: '',
      password: '',
      isGuest: true
    };
    this.currentUser = guest;
    sessionStorage.setItem('currentUser', JSON.stringify(guest));
  }


  /*
   * ── 更新個人資料（暫時版本）──────────────────────
   * 直接修改記憶體中的假資料（重新整理頁面後會消失）
   * 未來替換：
   *   this.http.put('/api/user/profile', { name, phone })
   * ────────────────────────────────────────────────── */
  updateProfile(name: string, phone: string, newPassword: string): void {
    if (this.currentUser) {
      this.currentUser.name = name;
      this.currentUser.phone = phone;
      /* 只有使用者有輸入新密碼時才更新 */
      if (newPassword.trim().length > 0) {
        this.currentUser.password = newPassword;
      }
      /* sessionStorage 同步更新，確保重新整理後資料不回復 */
      sessionStorage.setItem('currentUser', JSON.stringify(this.currentUser));
    }
  }

}
