import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-match-history-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './match-history-page.component.html'
})
export class MatchHistoryPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  matches: any[] = [];

  ngOnInit(): void {
    this.api.getCompletedMatches().subscribe((m: any) => {
      this.matches = m as any[];
    });
  }
}

