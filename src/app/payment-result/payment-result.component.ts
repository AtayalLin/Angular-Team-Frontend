import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-payment-result',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5;font-family:sans-serif;">
      <div style="background:#fff;border-radius:16px;padding:48px 40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.1);max-width:400px;width:90%;">
        @if (status === 'success') {
          <div style="font-size:64px;margin-bottom:16px;">✅</div>
          <h2 style="color:#2e7d32;margin:0 0 8px">付款成功</h2>
          <p style="color:#666;margin:0 0 24px">感謝您的消費，正在返回首頁…</p>
        } @else if (status === 'cancel') {
          <div style="font-size:64px;margin-bottom:16px;">↩️</div>
          <h2 style="color:#e65100;margin:0 0 8px">已取消付款</h2>
          <p style="color:#666;margin:0 0 24px">您取消了本次付款，正在返回…</p>
        } @else {
          <div style="font-size:64px;margin-bottom:16px;">❌</div>
          <h2 style="color:#c62828;margin:0 0 8px">付款失敗</h2>
          <p style="color:#666;margin:0 0 24px">{{ error || '請重新嘗試或聯絡客服' }}</p>
        }
        <button (click)="goHome()"
          style="background:#c8a96e;color:#fff;border:none;border-radius:8px;padding:12px 32px;font-size:16px;cursor:pointer;">
          返回首頁
        </button>
        <p style="color:#999;font-size:13px;margin:16px 0 0">{{ countdown }} 秒後自動返回</p>
      </div>
    </div>
  `
})
export class PaymentResultComponent implements OnInit {
  status = 'success';
  error = '';
  countdown = 5;

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.status = this.route.snapshot.queryParamMap.get('status') ?? 'success';
    this.error = this.route.snapshot.queryParamMap.get('error') ?? '';

    const timer = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        clearInterval(timer);
        this.goHome();
      }
    }, 1000);
  }

  goHome() {
    this.router.navigate(['/customer-home']);
  }
}
