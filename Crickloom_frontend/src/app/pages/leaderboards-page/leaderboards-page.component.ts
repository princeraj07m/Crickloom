import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-leaderboards-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leaderboards-page.component.html'
})
export class LeaderboardsPageComponent implements OnInit {
  private readonly api = inject(ApiService);

  protected format = signal<'T20' | 'ODI' | 'TEST'>('T20');
  protected data = signal<any>(null);

  ngOnInit(): void {
    this.load();
  }

  protected setFormat(fmt: 'T20' | 'ODI' | 'TEST'): void {
    this.format.set(fmt);
    this.load();
  }

  private load(): void {
    this.api.getLeaderboards(this.format()).subscribe(d => this.data.set(d));
  }
}

