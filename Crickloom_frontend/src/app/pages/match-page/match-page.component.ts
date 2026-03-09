import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { LiveScoreService } from '../../services/live-score.service';
import { AuthService } from '../../services/auth.service';
import { FormsModule } from '@angular/forms';

type TabKey = 'live' | 'scorecard' | 'overs' | 'stats' | 'highlights';

@Component({
  selector: 'app-match-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './match-page.component.html'
})
export class MatchPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly live = inject(LiveScoreService);
  protected readonly auth = inject(AuthService);

  protected matchSummary: any;
  protected balls: any[] = [];
  protected matchPlayers: any[] = [];
  protected activeTab = signal<TabKey>('live');
  protected loginPassword = '';
  protected loggingIn = false;
  protected loginError = '';
  protected actionError = '';
  protected actionMessage = '';

  protected ballInput = {
    strikerId: '',
    nonStrikerId: '',
    bowlerId: '',
    runs: 0,
    ballType: 'LEGAL',
    wicketType: '',
    playerOutId: ''
  };

  private matchId!: string;
  private sub: any;

  getInningsBatting(inningsIndex: number): { playerId: string; name: string; runs: number; balls: number; fours: number; sixes: number }[] {
    const statsMap = new Map<string, { playerId: string; name: string; runs: number; balls: number; fours: number; sixes: number }>();
    for (const b of this.balls) {
      if (b.inningsIndex !== inningsIndex) continue;
      if (b.ballType === 'WIDE' || b.ballType === 'NO_BALL') continue;
      const striker = b.striker;
      if (!striker?._id) continue;
      const key = striker._id;
      if (!statsMap.has(key)) {
        statsMap.set(key, { playerId: key, name: striker.name, runs: 0, balls: 0, fours: 0, sixes: 0 });
      }
      const s = statsMap.get(key)!;
      s.balls += 1;
      if (b.ballType === 'LEGAL') {
        s.runs += b.runs;
        if (b.runs === 4) s.fours += 1;
        if (b.runs === 6) s.sixes += 1;
      }
    }
    return Array.from(statsMap.values());
  }

  getInningsBowling(inningsIndex: number): { playerId: string; name: string; overs: number; balls: number; runs: number; wickets: number }[] {
    const statsMap = new Map<string, { playerId: string; name: string; overs: number; balls: number; runs: number; wickets: number }>();
    for (const b of this.balls) {
      if (b.inningsIndex !== inningsIndex) continue;
      const bowler = b.bowler;
      if (!bowler?._id) continue;
      const key = bowler._id;
      if (!statsMap.has(key)) {
        statsMap.set(key, { playerId: key, name: bowler.name, overs: 0, balls: 0, runs: 0, wickets: 0 });
      }
      const s = statsMap.get(key)!;
      if (b.ballType === 'LEGAL' || b.ballType === 'BYE' || b.ballType === 'LEG_BYE') {
        s.balls += 1;
      }
      s.runs += b.runs + (b.extras || 0);
      if (b.wicketType) {
        s.wickets += 1;
      }
    }
    for (const s of statsMap.values()) {
      s.overs = Math.floor(s.balls / 6) + (s.balls % 6) / 10;
    }
    return Array.from(statsMap.values());
  }

  getOverSummary(inningsIndex: number): { over: number; balls: any[]; runs: number }[] {
    const map = new Map<number, { over: number; balls: any[]; runs: number }>();
    for (const b of this.balls) {
      if (b.inningsIndex !== inningsIndex) continue;
      const overNo = b.overNumber;
      if (!map.has(overNo)) {
        map.set(overNo, { over: overNo, balls: [], runs: 0 });
      }
      const o = map.get(overNo)!;
      o.balls.push(b);
      o.runs += b.runs + (b.extras || 0);
    }
    return Array.from(map.values()).sort((a, b) => a.over - b.over);
  }

  getHighlights(): { topScorer?: any; bestBowler?: any } {
    const innings0Bat = this.getInningsBatting(0);
    const innings1Bat = this.getInningsBatting(1);
    const allBat = [...innings0Bat, ...innings1Bat];
    const topScorer = allBat.sort((a, b) => b.runs - a.runs)[0];

    const innings0Bowl = this.getInningsBowling(0);
    const innings1Bowl = this.getInningsBowling(1);
    const allBowl = [...innings0Bowl, ...innings1Bowl];
    const bestBowler = allBowl.sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0];

    return { topScorer, bestBowler };
  }

  protected async shareScorecard(): Promise<void> {
    const element = document.getElementById('scorecard-container');
    if (!element) {
      return;
    }
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(element, { backgroundColor: '#000000' });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'scorecard.png';
    link.click();
  }

  ngOnInit(): void {
    this.matchId = this.route.snapshot.paramMap.get('id')!;
    this.loadData();
    this.live.joinMatch(this.matchId);
    this.sub = this.live.onMatchUpdate().subscribe(event => {
      if (event.match && event.match._id === this.matchId) {
        this.matchSummary = {
          ...this.matchSummary,
          match: event.match
        };
        this.balls = [...this.balls, event.lastBall];
      }
    });
  }

  ngOnDestroy(): void {
    if (this.sub) {
      this.sub.unsubscribe();
    }
  }

  private loadData(): void {
    this.api.getMatchSummary(this.matchId).subscribe(summary => {
      this.matchSummary = summary;
    });
    this.api.getMatchBalls(this.matchId).subscribe(b => {
      this.balls = b as any[];
    });
    this.api.getMatchPlayers(this.matchId).subscribe(players => {
      this.matchPlayers = players as any[];
    });
  }

  protected setTab(tab: TabKey): void {
    this.activeTab.set(tab);
  }

  protected tryLogin(): void {
    this.loggingIn = true;
    this.loginError = '';
    this.api.login(this.loginPassword).subscribe({
      next: () => {
        this.auth.setAuthenticated(this.loginPassword);
        this.loggingIn = false;
      },
      error: () => {
        this.loginError = 'Invalid password';
        this.loggingIn = false;
      }
    });
  }

  protected submitBall(): void {
    if (!this.auth.isScorer || !this.auth.password) {
      return;
    }
    this.actionError = '';
    this.actionMessage = '';
    this.api.submitBall(this.matchId, this.ballInput, this.auth.password).subscribe({
      next: () => {
        this.ballInput.runs = 0;
        this.ballInput.ballType = 'LEGAL';
        this.ballInput.wicketType = '';
        this.ballInput.playerOutId = '';
        this.actionMessage = 'Ball recorded';
        this.loadData();
      },
      error: () => {
        this.actionError = 'Failed to submit ball';
      }
    });
  }

  protected undoLastBall(): void {
    if (!this.auth.isScorer || !this.auth.password) {
      return;
    }
    this.actionError = '';
    this.actionMessage = '';
    this.api.undoBall(this.matchId, this.auth.password).subscribe({
      next: res => {
        if (res.match) {
          this.matchSummary = { ...this.matchSummary, match: res.match };
        }
        if (res.balls) {
          this.balls = res.balls;
        }
        this.actionMessage = 'Last ball undone';
      },
      error: () => {
        this.actionError = 'No ball to undo';
      }
    });
  }

  protected endCurrentInnings(): void {
    if (!this.auth.isScorer || !this.auth.password) {
      return;
    }
    this.actionError = '';
    this.actionMessage = '';
    this.api.endInnings(this.matchId, this.auth.password).subscribe({
      next: match => {
        this.matchSummary = { ...this.matchSummary, match };
        this.actionMessage = 'Innings ended';
      },
      error: () => {
        this.actionError = 'Failed to end innings';
      }
    });
  }
}

