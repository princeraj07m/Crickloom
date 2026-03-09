import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly scorerSignal = signal(false);
  private passwordCache: string | null = null;

  get isScorer() {
    return this.scorerSignal();
  }

  get password() {
    return this.passwordCache;
  }

  setAuthenticated(password: string) {
    this.scorerSignal.set(true);
    this.passwordCache = password;
  }
}

