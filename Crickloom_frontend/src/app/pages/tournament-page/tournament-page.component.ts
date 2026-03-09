import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-tournament-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './tournament-page.component.html'
})
export class TournamentPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  tournament: any;
  matches: any[] = [];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.getTournaments().subscribe((tournaments: any) => {
      this.tournament = (tournaments as any[]).find(t => t._id === id);
    });
    this.api.getMatches().subscribe((matches: any) => {
      this.matches = (matches as any[]).filter(m => m.tournament._id === id);
    });
  }
}

