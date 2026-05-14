import { Routes } from '@angular/router';
import { StaffLoginComponent } from './global_meals_login/staff-login/staff-login.component';
import { CustomerLoginComponent } from './global_meals_login/customer-login/customer-login.component';
import { CustomerRegisterComponent } from './global_meals_login/customer-register/customer-register.component';
import { CustomerGuestComponent } from './global_meals_login/customer-guest/customer-guest.component';
import { CustomerMemberComponent } from './customer-member/customer-member.component';
import { CustomerHomeComponent } from './customer-home/customer-home.component';
import { ManagerDashboardComponent } from './manager-dashboard/manager-dashboard.component';
import { RmDashboardComponent } from './rm-dashboard/rm-dashboard.component';
import { PosTerminalComponent } from './pos-terminal/pos-terminal.component';
import { MobilePayComponent } from './mobile-pay/mobile-pay.component';
import { QrEntryComponent } from './qr-entry/qr-entry.component';
import { PaymentResultComponent } from './payment-result/payment-result.component';

export const routes: Routes = [
  { path: 'staff-login',        component: StaffLoginComponent },
  { path: 'customer-login',     component: CustomerLoginComponent },
  { path: 'customer-register',  component: CustomerRegisterComponent },
  { path: 'customer-guest',     component: CustomerGuestComponent },
  { path: 'customer-member',    component: CustomerMemberComponent },   /* 會員中心 */
  { path: 'customer-home',      component: CustomerHomeComponent },     /* 客戶主頁 */
  { path: 'manager-dashboard',  component: ManagerDashboardComponent }, /* 老闆管理後台 */
  { path: 'rm-dashboard',       component: RmDashboardComponent },      /* 分店長後台 */
  { path: 'pos-terminal',       component: PosTerminalComponent },      /* 分店長 / 員工 POS */
  { path: 'mobile-pay',         component: MobilePayComponent },        /* 手機掃碼付款確認頁 */
  { path: 'qr-entry',          component: QrEntryComponent },          /* QR Code 掃碼點餐入口 */
  { path: 'payment/result',    component: PaymentResultComponent },    /* 付款完成結果頁 */
  { path: 'payment/cancel',    component: PaymentResultComponent },    /* 付款取消 */
  { path: '',                   redirectTo: 'staff-login', pathMatch: 'full' },
];
