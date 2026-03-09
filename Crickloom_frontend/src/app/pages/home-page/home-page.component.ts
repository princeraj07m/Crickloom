import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home-page.component.html'
})
export class HomePageComponent implements OnInit {
  private readonly api = inject(ApiService);

  tournaments: any[] = [];
  matches: any[] = [];
  loading = true;

  ngOnInit(): void {
    this.api.getTournaments().subscribe(t => (this.tournaments = t as any[]));
    this.api.getMatches().subscribe(m => {
      this.matches = m as any[];
      this.loading = false;
    });
  }
}

