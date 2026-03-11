import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly scorerSignal = signal(false);
  private passwordCache: string | null = null;
  private matchId: string | null = null;

  private keyFor(matchId: string) {
    return `crickloom:match:${matchId}:scorerPassword`;
  }

  setMatchContext(matchId: string) {
    this.matchId = matchId;
    const cached = sessionStorage.getItem(this.keyFor(matchId));
    if (cached) {
      this.passwordCache = cached;
      this.scorerSignal.set(true);
    } else {
      this.passwordCache = null;
      this.scorerSignal.set(false);
    }
  }

  get isScorer() {
    return this.scorerSignal();
  }

  get password() {
    return this.passwordCache;
  }

  setAuthenticated(password: string) {
    this.scorerSignal.set(true);
    this.passwordCache = password;
    if (this.matchId) {
      sessionStorage.setItem(this.keyFor(this.matchId), password);
    }
  }

  logout() {
    if (this.matchId) {
      sessionStorage.removeItem(this.keyFor(this.matchId));
    }
    this.passwordCache = null;
    this.scorerSignal.set(false);
  }
}

