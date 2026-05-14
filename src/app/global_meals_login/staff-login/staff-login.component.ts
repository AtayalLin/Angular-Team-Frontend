import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LoadingService } from '../../shared/loading.service';
import { AuthService } from '../../shared/auth.service';
import { ApiService } from '../../shared/api.service';

@Component({
  selector: 'app-staff-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './staff-login.component.html',
  styleUrls: ['./staff-login.component.scss']
})
export class StaffLoginComponent {

  email = '';
  password = '';
  errorMsg: string | null = null;

  showPassword = false;
  togglePassword(): void { this.showPassword = !this.showPassword; }

  /* 首次登入彈窗 */
  showFirstLoginModal = false;
  firstLoginNewPwd = '';
  firstLoginConfirmPwd = '';
  showFirstLoginNewPwd = false;
  showFirstLoginConfirmPwd = false;
  firstLoginError: string | null = null;
  firstLoginLoading = false;
  private _firstLoginAccount = '';

  constructor(
    private router: Router,
    private loadingService: LoadingService,
    public authService: AuthService,
    private apiService: ApiService,
  ) {}

  submitLogin(): void {
    this.errorMsg = null;

    if (!this.email.trim() || !this.password.trim()) {
      this.errorMsg = '請輸入帳號與密碼';
      return;
    }

    this.authService.loginStaffApi(this.email.trim(), this.password.trim()).subscribe({
      next: (res) => {
        if (res.code === 200 && this.authService.currentUser) {

          // ← 核心改動：用後端回傳的 mustChangePassword 判斷
          if (res.mustChangePassword) {
            this._firstLoginAccount = this.authService.currentUser.email;
            this.firstLoginNewPwd = '';
            this.firstLoginConfirmPwd = '';
            this.firstLoginError = null;
            this.showFirstLoginModal = true;
          } else {
            this.navigateToDashboard();
          }

        } else if (res.code === 403) {
          this.errorMsg = '此帳號已停用，請聯絡管理員';
        } else if (res.code === 404) {
          this.errorMsg = '找不到此帳號，請確認帳號是否正確';
        } else if (res.code === 400) {
          this.errorMsg = '密碼錯誤，請重試';
        } else {
          this.errorMsg = '登入失敗（' + res.code + '），請確認後重試';
        }
      },
      error: () => {
        this.errorMsg = '登入失敗，請確認後端連線是否正常';
      }
    });
  }

  /* 跳過改密碼，直接進後台（每次登入都會繼續彈出）*/
  skipFirstLogin(): void {
    this.showFirstLoginModal = false;
    this.navigateToDashboard();
  }

  submitNewPassword(): void {
    const pwd = this.firstLoginNewPwd.trim();
    const confirm = this.firstLoginConfirmPwd.trim();

    if (!pwd) {
      this.firstLoginError = '請輸入新密碼';
      return;
    }
    if (pwd === '00000') {
      this.firstLoginError = '新密碼不能與預設密碼相同';
      return;
    }
    if (pwd !== confirm) {
      this.firstLoginError = '兩次輸入的密碼不一致';
      return;
    }

    this.firstLoginLoading = true;
    this.firstLoginError = null;

    this.apiService.selfChangePassword({
      account: this._firstLoginAccount,
      oldPassword: '00000',
      newPassword: pwd,
    }).subscribe({
      next: () => {
        this.firstLoginLoading = false;
        this.showFirstLoginModal = false;
        // 清除 mustChangePassword 標記
        sessionStorage.removeItem('mustChangePassword');
        this.navigateToDashboard();
      },
      error: () => {
        this.firstLoginLoading = false;
        this.firstLoginError = '密碼修改失敗，請重試';
      }
    });
  }

  private navigateToDashboard(): void {
    const role = this.authService.currentUser?.role;
    if (role === 'boss') {
      this.loadingService.showStaffLoading();
      setTimeout(() => {
        this.router.navigate(['/manager-dashboard']).then(() => this.loadingService.hide());
      }, 1400);
    } else if (role === 'branch_manager' || role === 'deputy_manager') {
      this.loadingService.showStaffLoading();
      setTimeout(() => {
        this.router.navigate(['/rm-dashboard']).then(() => this.loadingService.hide());
      }, 1400);
    } else {
      this.loadingService.showPosLoading();
      setTimeout(() => {
        this.router.navigate(['/pos-terminal']).then(() => this.loadingService.hide());
      }, 1400);
    }
  }

  goToCustomer(): void {
    this.loadingService.showCustomerLoading();
    setTimeout(() => {
      this.loadingService.hide();
      this.router.navigate(['/customer-login']);
    }, 2300);
  }
}