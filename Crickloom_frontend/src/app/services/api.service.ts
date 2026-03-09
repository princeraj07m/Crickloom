import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API_BASE = 'http://localhost:4000/api';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);

  getTournaments(): Observable<any> {
    return this.http.get(`${API_BASE}/tournaments`);
  }

  getMatches(): Observable<any> {
    return this.http.get(`${API_BASE}/matches`);
  }

  getMatch(id: string): Observable<any> {
    return this.http.get(`${API_BASE}/matches/${id}`);
  }

  getMatchSummary(id: string): Observable<any> {
    return this.http.get(`${API_BASE}/matches/${id}/summary`);
  }

  getMatchBalls(id: string): Observable<any> {
    return this.http.get(`${API_BASE}/matches/${id}/balls`);
  }

  getMatchPlayers(id: string): Observable<any> {
    return this.http.get(`${API_BASE}/matches/${id}/players`);
  }

  submitBall(matchId: string, payload: any, password: string): Observable<any> {
    return this.http.post(`${API_BASE}/matches/${matchId}/ball`, payload, {
      headers: {
        'x-global-password': password
      }
    });
  }

  undoBall(matchId: string, password: string): Observable<any> {
    return this.http.post(
      `${API_BASE}/matches/${matchId}/undo-ball`,
      {},
      {
        headers: {
          'x-global-password': password
        }
      }
    );
  }

  endInnings(matchId: string, password: string): Observable<any> {
    return this.http.post(
      `${API_BASE}/matches/${matchId}/end-innings`,
      {},
      {
        headers: {
          'x-global-password': password
        }
      }
    );
  }

  login(password: string): Observable<any> {
    return this.http.post(`${API_BASE}/login`, { password });
  }

  getPlayer(id: string): Observable<any> {
    return this.http.get(`${API_BASE}/players/${id}`);
  }

  getLeaderboards(format: string): Observable<any> {
    return this.http.get(`${API_BASE}/leaderboards/${format}`);
  }

  getCompletedMatches(): Observable<any> {
    return this.http.get(`${API_BASE}/matches/history/completed`);
  }
}

