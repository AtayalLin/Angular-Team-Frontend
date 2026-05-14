import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-qr-entry',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './qr-entry.component.html',
  styleUrls: ['./qr-entry.component.scss'],
})
export class QrEntryComponent implements OnInit {
  status: 'loading' | 'select' | 'invalid' = 'loading';
  tableId = '';

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const branch = this.route.snapshot.queryParamMap.get('branch');
    const table = this.route.snapshot.queryParamMap.get('table') ?? '';
    this.tableId = table;

    const branchId = Number(branch);
    if (!branch || isNaN(branchId) || branchId <= 0) {
      this.router.navigate(['/customer-guest']);
      return;
    }

    sessionStorage.setItem('qr_branch', String(branchId));
    sessionStorage.setItem('qr_table', table);

    setTimeout(() => {
      this.status = 'select';
    }, 900);
  }

  goMember(): void {
    this.router.navigate(['/customer-login']);
  }

  goGuest(): void {
    this.router.navigate(['/customer-guest']);
  }
}
