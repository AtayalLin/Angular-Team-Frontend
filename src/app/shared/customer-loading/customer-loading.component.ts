/*
 * =====================================================
 * 檔案名稱：customer-loading.component.ts
 * 位置說明：src/app/shared/customer-loading/customer-loading.component.ts
 * 用途說明：客戶端 Loading 過場動畫（完全對應 loading_v4.html 行為）
 * 功能說明：
 *   ① GSAP：遮罩淡入 + 卡片從下方彈出（Angular 專屬入場動畫）
 *   ② lottie-web：載入 assets/scan-to-order.json 並在 #lottieBox 渲染 SVG
 *   ③ requestAnimationFrame：百分比計數器，時間節點對應 loading_v4.html
 *        t=0ms    → 0%
 *        t=1030ms → 35%
 *        t=2350ms → 65%
 *        t=3670ms → 88%
 *        t=4700ms → 100%
 * Angular 知識點：
 *   AfterViewInit → DOM 渲染完成後才能操作真實 DOM
 *   @ViewChild    → 取得模板中 #overlay / #card / #lottieBox / #pctNum 元素
 *   ElementRef    → 包裝 DOM 元素的 Angular 型別，用 .nativeElement 取得原生元素
 * =====================================================
 */

import { Component, ElementRef, ViewChild, AfterViewInit, inject, computed } from '@angular/core';

/* GSAP 動畫引擎 */
import { gsap } from 'gsap';

/* lottie-web：完整版播放器（renderer:'svg'），從 npm lottie-web 引入 */
import lottie from 'lottie-web';

import { BranchService } from '../branch.service';


@Component({
  selector: 'app-customer-loading',          /* HTML 標籤：<app-customer-loading> */
  standalone: true,
  imports: [],
  templateUrl: './customer-loading.component.html',
  styleUrls: ['./customer-loading.component.scss']
})
export class CustomerLoadingComponent implements AfterViewInit {

  private branchService = inject(BranchService);
  lang = computed(() => this.branchService.lang());

  /* 全螢幕遮罩（GSAP 淡入用） */
  @ViewChild('overlay') overlay!: ElementRef;

  /* 分割卡片（GSAP 彈出用） */
  @ViewChild('card') card!: ElementRef;

  /* Lottie SVG 渲染目標容器 */
  @ViewChild('lottieBox') lottieBox!: ElementRef;

  /* 百分比數字元素（requestAnimationFrame 直接更新 textContent） */
  @ViewChild('pctNum') pctNum!: ElementRef;


  ngAfterViewInit(): void {

    /* ────────────────────────────────────────────────
     * ① GSAP 入場動畫
     *    遮罩：0.4 秒淡入
     *    卡片：0.7 秒從下方彈出（elastic 彈性）
     * ──────────────────────────────────────────────── */
    gsap.from(this.overlay.nativeElement, {
      duration: 0.4,
      opacity: 0,
      ease: 'power2.out'
    });

    gsap.from(this.card.nativeElement, {
      duration: 0.7,
      opacity: 0,
      y: 40,
      scale: 0.92,
      ease: 'elastic.out(1, 0.5)',
      delay: 0.1
    });


    /* ────────────────────────────────────────────────
     * ② lottie-web：載入 scan-to-order.json 並播放
     *    對應 loading_v4.html 的 lottie.loadAnimation()
     *    animationData 從 assets 讀取（fetch JSON）
     * ──────────────────────────────────────────────── */
    fetch('assets/scan-to-order.json')
      .then(res => res.json())
      .then(animationData => {
        lottie.loadAnimation({
          container: this.lottieBox.nativeElement,  /* 渲染目標 div */
          renderer: 'svg',                          /* SVG 渲染（高品質） */
          loop: true,
          autoplay: true,
          animationData                             /* 本地 JSON 資料 */
        });
      });


    /* ────────────────────────────────────────────────
     * ③ 百分比計數器（requestAnimationFrame 插值）
     *    對應 loading_v4.html 的 % counter 邏輯
     *    時間節點：0ms→0%  550ms→35%  1250ms→65%  1950ms→88%  2500ms→100%
     * ──────────────────────────────────────────────── */

    /* 時間-數值節點陣列，整體 1.8s */
    const kf: Array<{ t: number; v: number }> = [
      { t: 0,    v: 0   },
      { t: 396,  v: 35  },
      { t: 900,  v: 65  },
      { t: 1404, v: 88  },
      { t: 1800, v: 100 }
    ];

    const pctEl: HTMLElement = this.pctNum.nativeElement;
    let t0: number | null = null;

    /* tick：每幀計算當前百分比並更新 DOM */
    const tick = (ts: number): void => {
      if (t0 === null) t0 = ts;
      const elapsed = ts - t0;  /* 已過毫秒數 */

      /* 線性插值：找出 elapsed 所在的節點區間並計算當前值 */
      let v = 0;
      for (let i = 0; i < kf.length - 1; i++) {
        const from = kf[i];
        const to   = kf[i + 1];
        if (elapsed >= from.t && elapsed <= to.t) {
          const ratio = (elapsed - from.t) / (to.t - from.t);
          v = from.v + ratio * (to.v - from.v);
          break;
        }
      }
      /* elapsed 超過最後節點時，固定在 100 */
      if (elapsed >= kf[kf.length - 1].t) {
        v = 100;
      }

      /* 更新顯示文字（取整數，最大 100） */
      pctEl.textContent = Math.round(Math.min(v, 100)) + '%';

      /* 尚未到達 1800ms 則繼續請求下一幀 */
      if (elapsed < 1800) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);

  }

}
