import { Component, OnDestroy, OnInit, inject, signal, ChangeDetectorRef } from '@angular/core';
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
  private readonly cdr = inject(ChangeDetectorRef);

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

  protected showPlayerSelection = false;

  private matchId!: string;
  private sub: any;

  protected get currentInnings() {
    return this.matchSummary?.match?.innings?.[this.matchSummary?.match?.currentInningsIndex];
  }

  protected get battingPlayers(): any[] {
    const inn = this.currentInnings;
    if (!inn || !this.matchPlayers.length) {
      return this.matchPlayers;
    }
    const battingTeamId = inn.battingTeam._id || inn.battingTeam;

    // Players already out in this innings
    const outIds = new Set<string>(
      (inn.fallOfWickets || [])
        .map((w: any) => (w.playerOut?._id || w.playerOut || null))
        .filter((id: any): id is string => !!id)
    );

    const list = this.matchPlayers.filter(p => {
      const id = p._id;
      const inTeam =
        p.teams && p.teams.some((t: any) => (t._id || t) === battingTeamId);
      return inTeam && !outIds.has(id);
    });
    return list.length ? list : this.matchPlayers;
  }

  protected get bowlingPlayers(): any[] {
    const inn = this.currentInnings;
    if (!inn || !this.matchPlayers.length) {
      return this.matchPlayers;
    }
    const bowlingTeamId = inn.bowlingTeam._id || inn.bowlingTeam;
    const list = this.matchPlayers.filter(p =>
      p.teams && p.teams.some((t: any) => (t._id || t) === bowlingTeamId)
    );
    return list.length ? list : this.matchPlayers;
  }

  protected get isBowlerLockedForOver(): boolean {
    const inn = this.currentInnings;
    if (!inn) return false;
    // Lock bowler after first legal ball of the over
    return inn.ballsInOver !== 0;
  }

  protected get lastOverBowlerId(): string | null {
    if (!this.currentInnings) return null;
    const inningsIndex = this.matchSummary.match.currentInningsIndex;
    const ballsForInnings = this.balls.filter(b => b.inningsIndex === inningsIndex);
    if (!ballsForInnings.length) return null;
    const maxOver = Math.max(...ballsForInnings.map(b => b.overNumber));
    const lastOverBalls = ballsForInnings.filter(b => b.overNumber === maxOver);
    if (!lastOverBalls.length) return null;
    const last = lastOverBalls[lastOverBalls.length - 1];
    const bowler = last.bowler;
    return bowler?._id || bowler || null;
  }

  protected get isNewOver(): boolean {
    const inn = this.currentInnings;
    if (!inn) return false;
    // New over if no balls in current over but innings already has at least one over bowled
    return inn.ballsInOver === 0 && (inn.overs > 0 || this.balls.some(b => b.inningsIndex === this.matchSummary.match.currentInningsIndex));
  }

  protected getCurrentOverBalls(): any[] {
    if (!this.currentInnings) return this.balls;
    const inningsIndex = this.matchSummary.match.currentInningsIndex;
    const ballsForInnings = this.balls.filter(b => b.inningsIndex === inningsIndex);
    if (!ballsForInnings.length) return [];
    const maxOver = Math.max(...ballsForInnings.map(b => b.overNumber));
    return ballsForInnings.filter(b => b.overNumber === maxOver);
  }

  private getBatterLine(playerId: string | null): { name: string; runs: number; balls: number } | null {
    if (!playerId) return null;
    const innIdx = this.matchSummary?.match?.currentInningsIndex ?? 0;
    let runs = 0;
    let balls = 0;
    let name = '';
    for (const b of this.balls) {
      if (b.inningsIndex !== innIdx) continue;
      if (b.ballType === 'WIDE' || b.ballType === 'NO_BALL') continue;
      const striker = b.striker;
      const sid = striker?._id || striker;
      if (sid !== playerId) continue;
      name = striker?.name || name;
      balls += 1;
      if (b.ballType === 'LEGAL') {
        runs += b.runs;
      }
    }
    // Find name if no balls faced yet
    if (!name) {
      const p = this.matchPlayers.find(mp => mp._id === playerId);
      name = p?.name || 'Player';
    }
    return { name, runs, balls };
  }

  protected get strikerLine() {
    const inn = this.currentInnings;
    const id = inn?.striker?._id || inn?.striker || this.ballInput.strikerId || null;
    return this.getBatterLine(id);
  }

  protected get nonStrikerLine() {
    const inn = this.currentInnings;
    const id = inn?.nonStriker?._id || inn?.nonStriker || this.ballInput.nonStrikerId || null;
    return this.getBatterLine(id);
  }

  protected get currentBowlerLine(): { name: string; overs: string; runs: number; wickets: number } | null {
    const innIdx = this.matchSummary?.match?.currentInningsIndex ?? 0;
    // Use last ball bowler if exists, else current selection
    const ballsForInn = this.balls.filter(b => b.inningsIndex === innIdx);
    const last = ballsForInn.length ? ballsForInn[ballsForInn.length - 1] : null;
    const bowlerId = (last?.bowler?._id || last?.bowler || this.ballInput.bowlerId || null) as string | null;
    if (!bowlerId) return null;

    let balls = 0;
    let runs = 0;
    let wickets = 0;
    let name = '';
    for (const b of ballsForInn) {
      const bid = b.bowler?._id || b.bowler;
      if (bid !== bowlerId) continue;
      name = b.bowler?.name || name;
      runs += b.runs + (b.extras || 0);
      if (b.ballType === 'LEGAL' || b.ballType === 'BYE' || b.ballType === 'LEG_BYE') {
        balls += 1;
      }
      if (b.wicketType) wickets += 1;
    }
    if (!name) {
      const p = this.matchPlayers.find(mp => mp._id === bowlerId);
      name = p?.name || 'Bowler';
    }
    const overs = `${Math.floor(balls / 6)}.${balls % 6}`;
    return { name, overs, runs, wickets };
  }

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
    this.auth.setMatchContext(this.matchId);
    this.loadData();
    this.live.joinMatch(this.matchId);
    this.sub = this.live.onMatchUpdate().subscribe(event => {
      if (event.match && event.match._id === this.matchId) {
        this.matchSummary = {
          ...this.matchSummary,
          match: event.match
        };
        if (event.lastBall) {
          this.balls = [...this.balls, event.lastBall];
        }
        if (event.next) {
          this.ballInput.strikerId = event.next.strikerId ?? this.ballInput.strikerId;
          this.ballInput.nonStrikerId = event.next.nonStrikerId ?? this.ballInput.nonStrikerId;
          this.ballInput.bowlerId = event.next.bowlerId ?? this.ballInput.bowlerId;
        }
        this.cdr.detectChanges();
      }
    });
  }

  protected logoutScorer(): void {
    this.auth.logout();
    this.loginPassword = '';
    this.loginError = '';
    this.actionMessage = '';
    this.actionError = '';
  }

  ngOnDestroy(): void {
    if (this.sub) {
      this.sub.unsubscribe();
    }
  }

  private loadData(): void {
    this.api.getMatchSummary(this.matchId).subscribe(summary => {
      this.matchSummary = summary;
      this.initializeBallForm();
      this.cdr.detectChanges();
    });
    this.api.getMatchBalls(this.matchId).subscribe(b => {
      this.balls = b as any[];
      this.cdr.detectChanges();
    });
    this.api.getMatchPlayers(this.matchId).subscribe(players => {
      this.matchPlayers = players as any[];
      this.initializeBallForm(); // Re-initialize when players are loaded
      this.cdr.detectChanges();
    });
  }

  private initializeBallForm(): void {
    if (this.matchSummary?.match && this.matchPlayers.length > 0) {
      // Get current innings
      const currentInnings = this.matchSummary.match.innings[this.matchSummary.match.currentInningsIndex];
      if (currentInnings) {
        const outIds = new Set<string>(
          (currentInnings.fallOfWickets || [])
            .map((w: any) => (w.playerOut?._id || w.playerOut || null))
            .filter((id: any): id is string => !!id)
        );

        // Check if striker/non-striker are already set in the innings
        const hasStriker = currentInnings.striker;
        const hasNonStriker = currentInnings.nonStriker;

        const strikerId = hasStriker?._id || hasStriker;
        const nonStrikerId = hasNonStriker?._id || hasNonStriker;

        // If stored striker/non-striker are out (stale), force selection
        const strikerValid = strikerId && !outIds.has(strikerId);
        const nonStrikerValid = nonStrikerId && !outIds.has(nonStrikerId);

        if (strikerValid && nonStrikerValid) {
          // Innings already has players set, use them
          this.ballInput.strikerId = strikerId;
          this.ballInput.nonStrikerId = nonStrikerId;
          this.showPlayerSelection = false; // Hide selection fields
        } else {
          // No players set yet, show selection fields for initial setup
          this.showPlayerSelection = true;
          // Pre-select first two players from batting team as defaults
          const battingTeamId = currentInnings.battingTeam._id || currentInnings.battingTeam;
          const battingTeamPlayers = this.matchPlayers
            .filter(p => p.teams && p.teams.some((t: any) => (t._id || t) === battingTeamId))
            .filter(p => !outIds.has(p._id));

          // If one batsman is still known, keep them; only pick a replacement for the missing side.
          if (strikerValid) {
            this.ballInput.strikerId = strikerId;
          }
          if (nonStrikerValid) {
            this.ballInput.nonStrikerId = nonStrikerId;
          }

          if (battingTeamPlayers.length > 0) {
            if (!this.ballInput.strikerId) {
              this.ballInput.strikerId = battingTeamPlayers[0]._id;
            }
          }
          if (battingTeamPlayers.length > 1) {
            if (!this.ballInput.nonStrikerId) {
              const firstId = this.ballInput.strikerId;
              const candidate = battingTeamPlayers.find(p => p._id !== firstId);
              if (candidate) {
                this.ballInput.nonStrikerId = candidate._id;
              }
            }
          }
        }

        // Set a default bowler if not set (from bowling team)
        if (!this.ballInput.bowlerId) {
          const bowlingTeamId = currentInnings.bowlingTeam._id || currentInnings.bowlingTeam;
          const bowlingTeamPlayers = this.matchPlayers.filter(p =>
            p.teams && p.teams.some((t: any) => (t._id || t) === bowlingTeamId)
          );
          if (bowlingTeamPlayers.length > 0) {
            this.ballInput.bowlerId = bowlingTeamPlayers[0]._id;
          }
        }
      }
    }
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

    // Validate required fields
    if (!this.ballInput.strikerId || !this.ballInput.nonStrikerId || !this.ballInput.bowlerId) {
      this.actionError = 'Please select striker, non-striker, and bowler';
      return;
    }

    // Striker and non-striker must be different
    if (this.ballInput.strikerId === this.ballInput.nonStrikerId) {
      this.actionError = 'Striker and non-striker must be different players';
      return;
    }

    // When wicket selected, ensure playerOut is one of the two batsmen
    if (this.ballInput.wicketType) {
      if (!this.ballInput.playerOutId) {
        this.actionError = 'Select which batsman got out';
        return;
      }
      if (
        this.ballInput.playerOutId !== this.ballInput.strikerId &&
        this.ballInput.playerOutId !== this.ballInput.nonStrikerId
      ) {
        this.actionError = 'Player out must be one of the current batsmen';
        return;
      }
    }

    // Enforce at UI: same bowler cannot bowl consecutive overs
    if (this.isNewOver && this.ballInput.bowlerId && this.ballInput.bowlerId === this.lastOverBowlerId) {
      this.actionError = 'Same bowler cannot bowl consecutive overs';
      return;
    }

    this.actionError = '';
    this.actionMessage = '';

    this.api.submitBall(this.matchId, this.ballInput, this.auth.password).subscribe({
      next: (res: any) => {
        // Reset form for next ball (keeps current players via initializeBallForm)
        this.resetBallForm();
        // Prefer backend-computed next striker/non-striker (handles odd runs + end over + byes/legbyes)
        if (res?.next) {
          this.ballInput.strikerId = res.next.strikerId ?? this.ballInput.strikerId;
          this.ballInput.nonStrikerId = res.next.nonStrikerId ?? this.ballInput.nonStrikerId;
          this.ballInput.bowlerId = res.next.bowlerId ?? this.ballInput.bowlerId;
        }
        // If backend cleared a batsman slot (wicket), show selection to choose next batsman
        this.showPlayerSelection = !this.ballInput.strikerId || !this.ballInput.nonStrikerId;
        this.actionMessage = 'Ball recorded';
        this.loadData();
      },
      error: (err: any) => {
        this.actionError = err?.error?.message || 'Failed to submit ball';
      }
    });
  }

  private resetBallForm(): void {
    // Always reset runs, ball type, wicket type, and player out
    this.ballInput.runs = 0;
    this.ballInput.ballType = 'LEGAL';
    this.ballInput.wicketType = '';
    this.ballInput.playerOutId = '';

    // Hide player selection fields after submission (they will be shown again only on wickets)
    this.showPlayerSelection = false;

    // Re-initialize striker and non-striker from current innings (don't clear them)
    this.initializeBallForm();
  }

  protected onWicketTypeChange(): void {
    this.showPlayerSelection = !!this.ballInput.wicketType;
    if (!this.ballInput.wicketType) {
      this.ballInput.playerOutId = '';
    }
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

