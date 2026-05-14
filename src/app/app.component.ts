/*
 * =====================================================
 * 檔案名稱：app.component.ts
 * 用途說明：應用程式根元件（整個 App 的最外層）
 * 修改說明：
 *   - 新增 LoadingService 注入，讓 HTML 模板可以讀取 Loading 狀態
 *   - 新增兩個 Loading 元件的 import，讓 HTML 可以使用它們的標籤
 *     <app-staff-loading> 和 <app-customer-loading>
 * Angular 知識點：
 *   - RouterOutlet  路由出口，Angular 根據當前網址
 *                   把對應的頁面元件渲染到這個位置
 *   - constructor(public loadingService: LoadingService)
 *     宣告為 public，HTML 模板才能直接讀取 loadingService 的屬性
 *     例：loadingService.isLoading、loadingService.loadingType
 * =====================================================
 */

import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/* Loading 服務：管理是否顯示 Loading 遮罩 */
import { LoadingService } from './shared/loading.service';

/* 兩個 Loading 元件，根據 loadingType 選擇其中一個顯示 */
import { StaffLoadingComponent } from './shared/staff-loading/staff-loading.component';
import { CustomerLoadingComponent } from './shared/customer-loading/customer-loading.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    StaffLoadingComponent,
    CustomerLoadingComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  title = 'global_meals';

  constructor(public loadingService: LoadingService) {}

  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    // 在 ngrok 免費版下，首次瀏覽會出現攔截警告頁。
    // Angular 啟動後若偵測到 ngrok 網域且 URL 缺少 skip 參數，
    // 立即重導向並帶入參數，讓 ngrok 設定 cookie，後續訪問不再顯示警告。
    const { hostname, href, search } = window.location;
    if (hostname.includes('ngrok-free') && !href.includes('ngrok-skip-browser-warning')) {
      const sep = search ? '&' : '?';
      window.location.replace(href + sep + 'ngrok-skip-browser-warning=1');
    }
  }

}
