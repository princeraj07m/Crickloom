import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './home-page.component.html'
})
export class HomePageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  tournaments: any[] = [];
  matches: any[] = [];
  loading = true;
  error: string | null = null;

  // Create match modal
  showCreateMatchModal = false;
  creatingMatch = false;
  scorerPassword = '';
  availableTeams: any[] = [];
  newMatch = {
    tournamentId: '',
    format: '',
    teamAId: '',
    teamBId: '',
    title: '',
    oversLimit: null as number | null
  };

  ngOnInit(): void {
    this.loading = true;
    this.error = null;

    // Use forkJoin to wait for both requests
    forkJoin({
      tournaments: this.api.getTournaments(),
      matches: this.api.getMatches()
    }).subscribe({
      next: (res: any) => {
        console.log('Raw API response:', res);
        console.log('Tournaments from API:', res.tournaments);
        console.log('Matches from API:', res.matches);
        
        this.tournaments = Array.isArray(res.tournaments) ? res.tournaments : res.tournaments?.tournaments ?? [];
        this.matches = Array.isArray(res.matches) ? res.matches : res.matches?.matches ?? [];
        
        console.log('After assignment - Tournaments:', this.tournaments);
        console.log('After assignment - Matches:', this.matches);
        console.log('Tournaments length:', this.tournaments.length);
        console.log('Matches length:', this.matches.length);
        
        this.loading = false;
        
        // Manually trigger change detection
        this.cdr.detectChanges();
        
        console.log('Loading set to:', this.loading);
        console.log('Final state - Tournaments:', this.tournaments);
        console.log('Final state - Matches:', this.matches);
      },
      error: (err: any) => {
        console.error('Error loading data:', err);
        this.error = 'Failed to load data. Please refresh the page.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onTournamentChange(): void {
    if (this.newMatch.tournamentId) {
      this.api.getTournamentTeams(this.newMatch.tournamentId).subscribe({
        next: (teams: any) => {
          this.availableTeams = teams;
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          console.error('Error loading teams:', err);
          this.availableTeams = [];
        }
      });
    } else {
      this.availableTeams = [];
    }
  }

  createMatch(): void {
    if (!this.scorerPassword) {
      this.error = 'Scorer password is required';
      return;
    }

    this.creatingMatch = true;
    this.error = null;

    const matchData = {
      tournamentId: this.newMatch.tournamentId,
      format: this.newMatch.format,
      teamAId: this.newMatch.teamAId,
      teamBId: this.newMatch.teamBId,
      title: this.newMatch.title,
      oversLimit: this.newMatch.oversLimit
    };

    this.api.createMatch(matchData, this.scorerPassword).subscribe({
      next: (createdMatch: any) => {
        console.log('Match created:', createdMatch);
        this.matches.unshift(createdMatch); // Add to beginning of matches array
        this.showCreateMatchModal = false;
        this.creatingMatch = false;
        this.resetNewMatchForm();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error creating match:', err);
        this.error = 'Failed to create match. Please check your password and try again.';
        this.creatingMatch = false;
        this.cdr.detectChanges();
      }
    });
  }

  deleteMatch(match: any, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    const pwd = prompt(`Enter scorer password to delete:\n${match?.title || 'Match'}`);
    if (!pwd) return;

    this.api.deleteMatch(match._id, pwd).subscribe({
      next: () => {
        this.matches = this.matches.filter(m => m._id !== match._id);
        this.cdr.detectChanges();
      },
      error: () => {
        alert('Invalid password or delete failed.');
      }
    });
  }

  private resetNewMatchForm(): void {
    this.newMatch = {
      tournamentId: '',
      format: '',
      teamAId: '',
      teamBId: '',
      title: '',
      oversLimit: null
    };
    this.scorerPassword = '';
    this.availableTeams = [];
  }
}

