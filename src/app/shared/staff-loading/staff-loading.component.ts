/*
 * =====================================================
 * 檔案名稱：staff-loading.component.ts
 * 位置說明：src/app/shared/staff-loading/staff-loading.component.ts
 * 用途說明：切換到管理系統時顯示的 Loading 過場動畫元件
 * 設計風格：深海軍藍 #1E3A5F + 金黃色 #F0A500，專業企業感
 * 動畫組合：
 *   - ldrs <l-ring>  → 金黃色圓環旋轉 Loader
 *   - GSAP           → 遮罩淡入 + 內容盒子由下方滑入
 * Angular 知識點：
 *   - AfterViewInit  生命週期鉤子，DOM 渲染完成後才執行 ngAfterViewInit()
 *                    必須等 DOM 存在，才能讓 GSAP 抓到元素做動畫
 *   - @ViewChild     取得 HTML 模板裡有 # 標記的 DOM 元素
 *                    例：#overlay → this.overlay.nativeElement 就是那個 div
 *   - ElementRef     包裝原生 DOM 元素的 Angular 物件
 *                    用 .nativeElement 取得原始 DOM 元素傳給 GSAP
 *   - CUSTOM_ELEMENTS_SCHEMA
 *                    ldrs 的 <l-ring> 是 Web Component（自訂 HTML 標籤）
 *                    不加這個，Angular 編譯時會報錯說不認識 <l-ring>
 * =====================================================
 */

import { Component, ElementRef, ViewChild, AfterViewInit, Input, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

/* GSAP 動畫引擎，從已安裝的 gsap 套件引入 */
import { gsap } from 'gsap';

/* ldrs：向瀏覽器註冊 ring Loader（圓環旋轉），只需呼叫一次 */
import { ring } from 'ldrs';
ring.register();

@Component({
  selector: 'app-staff-loading',          /* HTML 標籤：<app-staff-loading> */
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],      /* 允許使用 <l-ring> 等 Web Component 標籤 */
  imports: [],
  templateUrl: './staff-loading.component.html',
  styleUrls: ['./staff-loading.component.scss']
})
export class StaffLoadingComponent implements AfterViewInit {

  /** 副標題文字（由 app.component.html 傳入，依登入身份不同） */
  @Input() subtitle: string = '正在連線至管理後台...';

  /*
   * @ViewChild('overlay')
   * 取得 HTML 裡 <div #overlay> 這個 DOM 元素
   * ! 驚嘆號表示「TypeScript 保證這個一定存在，不會是 null」
   */
  @ViewChild('overlay') overlay!: ElementRef;

  /* 取得 HTML 裡 <div #contentBox> 這個 DOM 元素 */
  @ViewChild('contentBox') contentBox!: ElementRef;

  /*
   * ngAfterViewInit：Angular 生命週期鉤子
   * 當此元件的 HTML 模板渲染完畢後，Angular 會自動呼叫這個方法
   * 在這裡執行 GSAP 動畫，確保 DOM 元素已經存在
   */
  ngAfterViewInit(): void {

    /*
     * GSAP gsap.from()：從指定的起始狀態「動畫到」元素目前的樣式
     * 例：opacity: 0 → 從透明 動畫到 元素本身的 opacity（不透明）
     *
     * 遮罩整體：0.3 秒從透明淡入
     */
    gsap.from(this.overlay.nativeElement, {
      duration: 0.3,       /* 動畫時長 0.3 秒 */
      opacity: 0,          /* 從透明開始 */
      ease: 'power2.out'   /* 緩出：快速開始，逐漸減速 */
    });

    /*
     * 內容盒子：0.45 秒從下方 30px + 縮小狀態 滑入
     * delay: 0.1 讓遮罩先出現，再跑這個動畫，有層次感
     * back.out(1.7)：過衝後回彈效果（像按鈕按下去會稍微反彈）
     */
    gsap.from(this.contentBox.nativeElement, {
      duration: 0.45,
      opacity: 0,
      y: 30,               /* 從下方 30px 的位置開始 */
      scale: 0.88,         /* 從 88% 大小開始 */
      ease: 'back.out(1.7)',
      delay: 0.1
    });

  }

}
