import { Routes } from '@angular/router';
import { HomePageComponent } from './pages/home-page/home-page.component';
import { TournamentPageComponent } from './pages/tournament-page/tournament-page.component';
import { MatchPageComponent } from './pages/match-page/match-page.component';
import { PlayerProfilePageComponent } from './pages/player-profile-page/player-profile-page.component';
import { LeaderboardsPageComponent } from './pages/leaderboards-page/leaderboards-page.component';
import { MatchHistoryPageComponent } from './pages/match-history-page/match-history-page.component';

export const routes: Routes = [
  { path: '', component: HomePageComponent },
  { path: 'tournament/:id', component: TournamentPageComponent },
  { path: 'match/:id', component: MatchPageComponent },
  { path: 'player/:id', component: PlayerProfilePageComponent },
  { path: 'leaderboards', component: LeaderboardsPageComponent },
  { path: 'history', component: MatchHistoryPageComponent }
];
