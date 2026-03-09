import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-player-profile-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-profile-page.component.html'
})
export class PlayerProfilePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  player: any;
  stats: any[] = [];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.getPlayer(id).subscribe((res: any) => {
      this.player = res.player;
      this.stats = res.stats;
    });
  }
}

