import { Component, OnInit, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { QRCodeComponent } from 'angularx-qrcode';

import { AuthService } from '../../shared/auth.service';
import { LoadingService } from '../../shared/loading.service';
import { BranchService, CountryCode, CountryConfig } from '../../shared/branch.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-customer-login',
  standalone: true,
  imports: [FormsModule, RouterLink, QRCodeComponent, CommonModule],
  templateUrl: './customer-login.component.html',
  styleUrls: ['./customer-login.component.scss']
})
export class CustomerLoginComponent implements OnInit {

  showPassword = false;
  account = '';
  password = '';
  loginError = false;
  loginErrorMsg = '帳號或密碼錯誤，請再試一次';

  get allCountries(): CountryConfig[] { return this.branchService.allCountries; }
  get activeCountry(): CountryCode    { return this.branchService.country; }
  get branches()          { return this.branchService.localizedBranches(); }
  get selectedBranchId(): number { return this.branchService.globalAreaId; }
  get selectedBranchName(): string {
    return this.branches.find(b => b.id === this.selectedBranchId)?.name
        ?? this.branches[0]?.name ?? '';
  }

  branchDropdownOpen = false;

  toggleBranchDropdown(): void { this.branchDropdownOpen = !this.branchDropdownOpen; }
  closeBranchDropdown(): void  { this.branchDropdownOpen = false; }

  selectBranch(id: number): void {
    this.branchService.setGlobalAreaId(id);
    this.branchDropdownOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.c-branch-selector')) this.branchDropdownOpen = false;
  }

  /** 給 HTML template 直接讀取 branchService.lang() */
  get lang() { return this.branchService.lang(); }

  /** QR Code URL：現場掃碼先進選擇頁，ngrok-skip-browser-warning 跳過 ngrok 警告頁 */
  get qrUrl(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/qr-entry?branch=${this.branchService.globalAreaId}&ngrok-skip-browser-warning=1`;
  }

  constructor(
    private router: Router,
    private authService: AuthService,
    private loadingService: LoadingService,
    public branchService: BranchService
  ) {}

  ngOnInit(): void {
    this.branchService.init();
  }

  selectCountry(code: CountryCode): void {
    this.branchService.setCountry(code);
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  onLogin(): void {
    this.loginError = false;
    if (!this.account.trim()) {
      this.loginErrorMsg = '請輸入手機號碼或電子郵件';
      this.loginError = true;
      return;
    }
this.authService.loginMember(this.account.trim(), this.password).subscribe({
      next: (res) => {
        if (res.code === 200) {
          this.loadingService.showCustomerLoading();
          setTimeout(() => {
            this.loadingService.hide();
            this.router.navigate(['/customer-home']);
          }, 2300);
        } else {
          this.loginError = true;
        }
      },
      error: () => {
        this.loginError = true;
      }
    });
  }

  goToStaff(): void {
    this.loadingService.showStaffLoading();
    setTimeout(() => {
      this.router.navigate(['/staff-login']).then(() => this.loadingService.hide());
    }, 1500);
  }
}
