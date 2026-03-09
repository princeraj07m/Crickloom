import { Injectable, NgZone } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LiveScoreService {
  private socket: Socket | null = null;

  constructor(private readonly zone: NgZone) {
    this.socket = io('http://localhost:4000');
  }

  joinMatch(matchId: string): void {
    this.socket?.emit('joinMatch', matchId);
  }

  onMatchUpdate(): Observable<any> {
    return new Observable(observer => {
      this.socket?.on('match:update', data => {
        this.zone.run(() => observer.next(data));
      });
      return () => {
        this.socket?.off('match:update');
      };
    });
  }
}

