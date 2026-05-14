import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';

interface PayItem {
  name: string;
  qty: number;
  price: number;
}

@Component({
  selector: 'app-mobile-pay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mobile-pay.component.html',
  styleUrls: ['./mobile-pay.component.scss'],
})
export class MobilePayComponent implements OnInit {
  storeName = signal('懶飽飽 Lazy BaoBao');
  amount    = signal(0);
  items     = signal<PayItem[]>([]);
  paid      = signal(false);

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const p = this.route.snapshot.queryParams;
    if (p['store'])  this.storeName.set(p['store']);
    if (p['amount']) this.amount.set(Number(p['amount']));
    if (p['items']) {
      try { this.items.set(JSON.parse(p['items'])); } catch {}
    }
  }

  confirm(): void { this.paid.set(true); }
  cancel():  void { window.close(); }
}
