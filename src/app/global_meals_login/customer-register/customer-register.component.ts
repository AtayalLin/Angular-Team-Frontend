import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BranchService, CountryCode, CountryConfig } from '../../shared/branch.service';
import { ApiService, RegionVO } from '../../shared/api.service';

@Component({
  selector: 'app-customer-register',
  standalone: true,
  imports: [RouterModule, FormsModule],
  templateUrl: './customer-register.component.html',
  styleUrls: ['./customer-register.component.scss'],
})
export class CustomerRegisterComponent implements OnInit {
  name = '';
  phone = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  showConfirmPassword = false;

  regions: RegionVO[] = [];
  selectedRegionsId = 0;

  nameError = false;
  phoneError = false;
  phoneErrorMsg = '';
  passwordError = false;
  confirmError = false;
  registering = false;
  registerError = '';
  showSuccessModal = false;

  constructor(
    public branchService: BranchService,
    private apiService: ApiService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.branchService.init();
    this.apiService.getAllTax().subscribe({
      next: res => {
        if (res.code === 200) {
          this.regions = res.regionsList ?? [];
          if (this.regions.length > 0) {
            this.selectedRegionsId = this.regions[0].id;
          }
        }
      }
    });
  }

  get lang() {
    return this.branchService.lang();
  }
  get allCountries(): CountryConfig[] { return this.branchService.allCountries; }
  get activeCountry(): CountryCode    { return this.branchService.country; }
  get dialCode(): string {
    return this.branchService.config.dialCode;
  }
  get dialLabel(): string {
    return `${this.branchService.config.nameLocal} ${this.branchService.config.dialCode}`;
  }

  selectCountry(code: CountryCode): void {
    this.branchService.setCountry(code);
  }

  onRegionChange(event: Event): void {
    this.selectedRegionsId = Number((event.target as HTMLSelectElement).value);
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }
  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  clearError(field: 'name' | 'phone' | 'password' | 'confirm'): void {
    if (field === 'name') this.nameError = false;
    if (field === 'phone') this.phoneError = false;
    if (field === 'password') this.passwordError = false;
    if (field === 'confirm') this.confirmError = false;
  }

  onRegister(): void {
    this.nameError = false;
    this.phoneError = false;
    this.passwordError = false;
    this.confirmError = false;
    let valid = true;

    if (!this.name.trim()) {
      this.nameError = true;
      valid = false;
    }

    const cleaned = this.phone.replace(/\D/g, '');
    if (cleaned.length < 6) {
      this.phoneError = true;
      this.phoneErrorMsg = this.lang.phonePlaceholder;
      valid = false;
    }

    if (this.password.length < 6) {
      this.passwordError = true;
      valid = false;
    }
    if (this.password !== this.confirmPassword) {
      this.confirmError = true;
      valid = false;
    }

    if (!valid) return;

    if (this.selectedRegionsId === 0) {
      this.registerError = '地區資料讀取中，請稍後再試';
      return;
    }

    const fullPhone = this.phone.trim();
    this.registering = true;
    this.registerError = '';
    // ✅ 這行已刪除（不需要在方法內重置）

    this.apiService
      .registerMember({
        name: this.name.trim(),
        phone: fullPhone,
        regionsId: this.selectedRegionsId,
        password: this.password,
      })
      .subscribe({
        next: (res) => {
          this.registering = false;
          if (res.code === 200) {
            this.showSuccessModal = true; // ✅ 有 this.
            setTimeout(() => {
              this.router.navigate(['/customer-login']);
            }, 3000);
          } else {
            this.registerError = res.message ?? '註冊失敗，請稍後再試';
          }
        },
        error: () => {
          this.registering = false;
          this.registerError = '連線失敗，請確認網路後再試';
        },
      });
  }
}
