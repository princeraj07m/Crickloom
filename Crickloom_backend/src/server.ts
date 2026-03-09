import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';
import {
  Tournament,
  Team,
  Player,
  Match,
  Ball,
  PlayerStats,
  Award,
  MatchFormat,
  BallType
} from './models';

dotenv.config();

const GLOBAL_PASSWORD = process.env.GLOBAL_PASSWORD || 'crickloom';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/crickloom';
const PORT = Number(process.env.PORT) || 4000;

async function bootstrap() {
  await mongoose.connect(MONGO_URI);

  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*'
    }
  });

  io.on('connection', socket => {
    socket.on('joinMatch', (matchId: string) => {
      socket.join(`match:${matchId}`);
    });
  });

  function requirePassword(req: express.Request, res: express.Response, next: express.NextFunction) {
    const pwd = (req.headers['x-global-password'] as string) || (req.body && (req.body.password as string));
    if (pwd !== GLOBAL_PASSWORD) {
      return res.status(401).json({ message: 'Invalid password' });
    }
    next();
  }

  // Basic seeding for initial tournament / teams / players / matches
  async function seedIfEmpty() {
    const tournamentsCount = await Tournament.countDocuments();
    if (tournamentsCount > 0) {
      return;
    }

    const tournament = await Tournament.create({ name: 'Crickloom Premier Cup' });

    // Helper to create team and players
    async function createTeam(name: string, shortName: string, players: string[]) {
      const team = await Team.create({ name, shortName, tournament: tournament._id });
      const playerDocs = await Promise.all(
        players.map(p =>
          Player.findOneAndUpdate(
            { name: p },
            { name: p },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          )
        )
      );
      await Team.updateOne(
        { _id: team._id },
        { $set: { /* players referenced via Player.teams */ } }
      );
      for (const p of playerDocs) {
        await Player.updateOne({ _id: p._id }, { $addToSet: { teams: team._id } });
      }
      return team;
    }

    // T20 lineups
    const primeV = await createTeam('PRIME-V', 'PRV', ['Prince', 'Rohit', 'Irfan', 'Nilesh', 'Raunak']);
    const ksa = await createTeam('KSA', 'KSA', ['Shudhanshu', 'Suhail', 'Ayush', 'Karan', 'Amit']);

    // ODI lineups
    const hydroX = await createTeam('Hydro X', 'HYX', ['Rohit', 'Ayush', 'Irfan', 'Prince', 'Amit']);
    const karnageRoyal = await createTeam('Karnage Royal', 'KRG', ['Raunak', 'Shudhanshu', 'Suhail', 'Nilesh', 'Karan']);

    // Test lineups
    const djKickers = await createTeam('DJ Kickers', 'DJK', ['Nilesh', 'Rohit', 'Irfan', 'Prince', 'Raunak']);
    const asm = await createTeam('ASM', 'ASM', ['Ayush', 'Suhail', 'Shudhanshu', 'Karan', 'Amit']);

    function oversForFormat(format: MatchFormat): number | undefined {
      if (format === 'T20') return 6;
      if (format === 'ODI') return 12;
      return undefined;
    }

    async function createMatch(format: MatchFormat, team1: typeof primeV, team2: typeof ksa, title: string) {
      const oversLimit = oversForFormat(format);
      const innings = [
        {
          battingTeam: team1._id,
          bowlingTeam: team2._id,
          runs: 0,
          wickets: 0,
          overs: 0,
          ballsInOver: 0,
          status: 'IN_PROGRESS',
          fallOfWickets: []
        },
        {
          battingTeam: team2._id,
          bowlingTeam: team1._id,
          runs: 0,
          wickets: 0,
          overs: 0,
          ballsInOver: 0,
          status: 'NOT_STARTED',
          fallOfWickets: []
        }
      ];

      await Match.create({
        tournament: tournament._id,
        format,
        title,
        teamA: team1._id,
        teamB: team2._id,
        oversLimit,
        currentInningsIndex: 0,
        innings,
        isCompleted: false,
        winnerEditable: true
      });
    }

    await createMatch('T20', primeV, ksa, 'T20: PRIME-V vs KSA');
    await createMatch('ODI', hydroX, karnageRoyal, 'ODI: Hydro X vs Karnage Royal');
    await createMatch('TEST', djKickers, asm, 'Test: DJ Kickers vs ASM');
  }

  await seedIfEmpty();

  function oversNumberToString(overs: number, balls: number): string {
    return `${overs}.${balls}`;
  }

  function computeRunRate(runs: number, overs: number, balls: number): number {
    const totalOvers = overs + balls / 6;
    if (totalOvers === 0) return 0;
    return Number((runs / totalOvers).toFixed(2));
  }

  app.get('/api/tournaments', async (_req, res) => {
    const tournaments = await Tournament.find();
    res.json(tournaments);
  });

  app.get('/api/matches', async (_req, res) => {
    const matches = await Match.find().populate('teamA teamB tournament');
    res.json(matches);
  });

  app.get('/api/matches/:id', async (req, res) => {
    const match = await Match.findById(req.params.id).populate('teamA teamB tournament innings.battingTeam innings.bowlingTeam');
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }
    res.json(match);
  });

  app.post('/api/login', (req, res) => {
    const { password } = req.body as { password: string };
    if (password === GLOBAL_PASSWORD) {
      return res.json({ success: true });
    }
    return res.status(401).json({ message: 'Invalid password' });
  });

  interface BallInput {
    strikerId: string;
    nonStrikerId: string;
    bowlerId: string;
    runs: number;
    ballType: BallType;
    wicketType?: string;
    playerOutId?: string;
  }

  app.post('/api/matches/:id/ball', requirePassword, async (req, res) => {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }
    if (match.isCompleted) {
      return res.status(400).json({ message: 'Match already completed' });
    }

    const input = req.body as BallInput;
    const innings = match.innings[match.currentInningsIndex];

    if (!innings) {
      return res.status(400).json({ message: 'Invalid innings' });
    }

    let { overs, ballsInOver, runs, wickets } = innings;

    let totalRunsThisBall = input.runs;
    let extras = 0;

    if (input.ballType === 'WIDE' || input.ballType === 'NO_BALL') {
      // 0 runs but does not count as ball, extras not added to runs
      totalRunsThisBall = 0;
    } else if (input.ballType === 'BYE' || input.ballType === 'LEG_BYE') {
      extras = input.runs;
      runs += input.runs;
    } else {
      // normal legal ball with runs
      runs += input.runs;
    }

    const countsAsBall = input.ballType === 'LEGAL' || input.ballType === 'BYE' || input.ballType === 'LEG_BYE';

    if (countsAsBall) {
      ballsInOver += 1;
      if (ballsInOver === 6) {
        overs += 1;
        ballsInOver = 0;
      }

      if (input.wicketType && input.playerOutId) {
        wickets += 1;
        innings.fallOfWickets.push({
          score: runs,
          wicket: wickets,
          over: oversNumberToString(overs, ballsInOver),
          playerOut: new mongoose.Types.ObjectId(input.playerOutId),
          dismissalType: input.wicketType
        });
      }
    }

    innings.runs = runs;
    innings.wickets = wickets;
    innings.overs = overs;
    innings.ballsInOver = ballsInOver;

    // Persist ball
    const ballDoc = await Ball.create({
      match: match._id,
      inningsIndex: match.currentInningsIndex,
      overNumber: overs,
      ballInOver: ballsInOver,
      striker: input.strikerId,
      nonStriker: input.nonStrikerId,
      bowler: input.bowlerId,
      runs: input.runs,
      extras,
      ballType: input.ballType,
      wicketType: input.wicketType,
      playerOut: input.playerOutId
    });

    // Update player stats (simplified: assumes all runs go to striker on legal ball)
    const matchFormat = match.format;

    async function getStats(playerId: string) {
      return PlayerStats.findOneAndUpdate(
        { player: playerId, format: matchFormat },
        { player: playerId, format: matchFormat },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    if (countsAsBall) {
      const strikerStats = await getStats(input.strikerId);
      strikerStats.ballsFaced += 1;
      if (input.ballType === 'LEGAL') {
        strikerStats.runs += input.runs;
        if (input.runs === 4) strikerStats.fours += 1;
        if (input.runs === 6) strikerStats.sixes += 1;
      }
      await strikerStats.save();

      const bowlerStats = await getStats(input.bowlerId);
      bowlerStats.ballsBowled += 1;
      bowlerStats.runsConceded += input.runs + extras;
      if (input.wicketType) {
        bowlerStats.wickets += 1;
      }
      await bowlerStats.save();
    }

    await match.save();

    // Simple winner detection when chasing side passes target or overs finished
    if (match.currentInningsIndex === 1) {
      const first = match.innings[0];
      const second = match.innings[1];
      const oversLimit = match.oversLimit;

      const targetReached = second.runs > first.runs;
      const ballsBowledSecond = second.overs * 6 + second.ballsInOver;
      const ballsLimit = oversLimit ? oversLimit * 6 : undefined;
      const inningsOver = ballsLimit !== undefined ? ballsBowledSecond >= ballsLimit || second.wickets === 10 : false;

      if (targetReached || inningsOver) {
        match.isCompleted = true;
        match.winnerTeam = targetReached ? second.battingTeam : first.battingTeam;
        second.status = 'COMPLETED';
        await match.save();
      }
    } else if (match.currentInningsIndex === 0 && match.oversLimit) {
      const first = match.innings[0];
      const ballsBowled = first.overs * 6 + first.ballsInOver;
      if (ballsBowled >= match.oversLimit * 6 || first.wickets === 10) {
        first.status = 'COMPLETED';
        match.currentInningsIndex = 1;
        match.innings[1].status = 'IN_PROGRESS';
        await match.save();
      }
    }

    const populatedMatch = await Match.findById(match._id).populate('teamA teamB tournament innings.battingTeam innings.bowlingTeam');

    io.to(`match:${match._id.toString()}`).emit('match:update', {
      match: populatedMatch,
      lastBall: ballDoc
    });

    res.json({
      match: populatedMatch,
      ball: ballDoc
    });
  });

  app.post('/api/matches/:id/undo-ball', requirePassword, async (req, res) => {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }
    if (match.isCompleted) {
      return res.status(400).json({ message: 'Cannot undo in a completed match' });
    }

    const inningsIndex = match.currentInningsIndex;
    const lastBall = await Ball.findOne({ match: match._id, inningsIndex }).sort({ createdAt: -1 });
    if (!lastBall) {
      return res.status(400).json({ message: 'No balls to undo' });
    }

    const innings = match.innings[inningsIndex];
    let { overs, ballsInOver, runs, wickets } = innings;

    const countsAsBall =
      lastBall.ballType === 'LEGAL' || lastBall.ballType === 'BYE' || lastBall.ballType === 'LEG_BYE';

    // Reverse aggregate runs
    runs -= lastBall.runs + (lastBall.extras || 0);
    if (runs < 0) runs = 0;

    if (countsAsBall) {
      if (ballsInOver === 0) {
        overs = Math.max(0, overs - 1);
        ballsInOver = 5;
      } else {
        ballsInOver -= 1;
      }

      if (lastBall.wicketType) {
        wickets = Math.max(0, wickets - 1);
        if (innings.fallOfWickets.length > 0) {
          innings.fallOfWickets.pop();
        }
      }
    }

    innings.runs = runs;
    innings.wickets = wickets;
    innings.overs = overs;
    innings.ballsInOver = ballsInOver;

    // Reverse player stats for this ball
    const matchFormat = match.format;

    async function getStatsFor(playerId: mongoose.Types.ObjectId) {
      return PlayerStats.findOneAndUpdate(
        { player: playerId, format: matchFormat },
        { player: playerId, format: matchFormat },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    if (countsAsBall) {
      const strikerStats = await getStatsFor(lastBall.striker as any);
      strikerStats.ballsFaced = Math.max(0, strikerStats.ballsFaced - 1);
      if (lastBall.ballType === 'LEGAL') {
        strikerStats.runs = Math.max(0, strikerStats.runs - lastBall.runs);
        if (lastBall.runs === 4 && strikerStats.fours > 0) strikerStats.fours -= 1;
        if (lastBall.runs === 6 && strikerStats.sixes > 0) strikerStats.sixes -= 1;
      }
      await strikerStats.save();

      const bowlerStats = await getStatsFor(lastBall.bowler as any);
      bowlerStats.ballsBowled = Math.max(0, bowlerStats.ballsBowled - 1);
      bowlerStats.runsConceded = Math.max(
        0,
        bowlerStats.runsConceded - (lastBall.runs + (lastBall.extras || 0))
      );
      if (lastBall.wicketType && bowlerStats.wickets > 0) {
        bowlerStats.wickets -= 1;
      }
      await bowlerStats.save();
    }

    await Ball.deleteOne({ _id: lastBall._id });
    await match.save();

    const populatedMatch = await Match.findById(match._id).populate(
      'teamA teamB tournament innings.battingTeam innings.bowlingTeam'
    );
    const balls = await Ball.find({ match: match._id, inningsIndex }).sort({ createdAt: 1 });

    io.to(`match:${match._id.toString()}`).emit('match:update', {
      match: populatedMatch,
      lastBall: null
    });

    res.json({
      match: populatedMatch,
      balls
    });
  });

  app.post('/api/matches/:id/end-innings', requirePassword, async (req, res) => {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }
    if (match.isCompleted) {
      return res.status(400).json({ message: 'Match already completed' });
    }

    const innings = match.innings[match.currentInningsIndex];
    if (!innings) {
      return res.status(400).json({ message: 'Invalid innings' });
    }

    innings.status = 'COMPLETED';
    if (match.currentInningsIndex === 0) {
      match.currentInningsIndex = 1;
      if (match.innings[1]) {
        match.innings[1].status = 'IN_PROGRESS';
      }
    } else {
      match.isCompleted = true;
    }

    await match.save();

    const populatedMatch = await Match.findById(match._id).populate(
      'teamA teamB tournament innings.battingTeam innings.bowlingTeam'
    );

    io.to(`match:${match._id.toString()}`).emit('match:update', {
      match: populatedMatch,
      lastBall: null
    });

    res.json(populatedMatch);
  });

  app.post('/api/matches/:id/winner', requirePassword, async (req, res) => {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }
    if (!match.winnerEditable) {
      return res.status(400).json({ message: 'Winner is locked' });
    }
    const { winnerTeamId } = req.body as { winnerTeamId: string };
    match.winnerTeam = new mongoose.Types.ObjectId(winnerTeamId);
    match.isCompleted = true;
    await match.save();
    res.json(match);
  });

  app.get('/api/players/:id', async (req, res) => {
    const player = await Player.findById(req.params.id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }
    const stats = await PlayerStats.find({ player: player._id });
    res.json({ player, stats });
  });

  app.get('/api/leaderboards/:format', async (req, res) => {
    const format = req.params.format as MatchFormat;
    const battingMostRuns = await PlayerStats.find({ format }).sort({ runs: -1 }).limit(10).populate('player');
    const battingBestStrikeRate = await PlayerStats.find({ format, ballsFaced: { $gt: 0 } })
      .lean()
      .populate('player');

    battingBestStrikeRate.sort((a: any, b: any) => {
      const srA = a.ballsFaced ? (a.runs / a.ballsFaced) * 100 : 0;
      const srB = b.ballsFaced ? (b.runs / b.ballsFaced) * 100 : 0;
      return srB - srA;
    });

    const bowlingMostWickets = await PlayerStats.find({ format }).sort({ wickets: -1 }).limit(10).populate('player');
    const bowlingBestEconomy = await PlayerStats.find({ format, ballsBowled: { $gt: 0 } })
      .lean()
      .populate('player');

    bowlingBestEconomy.sort((a: any, b: any) => {
      const oversA = a.ballsBowled / 6;
      const oversB = b.ballsBowled / 6;
      const ecoA = oversA ? a.runsConceded / oversA : 999;
      const ecoB = oversB ? b.runsConceded / oversB : 999;
      return ecoA - ecoB;
    });

    const fieldingMostCatches = await PlayerStats.find({ format }).sort({ catches: -1 }).limit(10).populate('player');
    const fieldingMostRunOuts = await PlayerStats.find({ format }).sort({ runOuts: -1 }).limit(10).populate('player');

    res.json({
      battingMostRuns,
      battingBestStrikeRate: battingBestStrikeRate.slice(0, 10),
      bowlingMostWickets,
      bowlingBestEconomy: bowlingBestEconomy.slice(0, 10),
      fieldingMostCatches,
      fieldingMostRunOuts
    });
  });

  app.get('/api/matches/:id/summary', async (req, res) => {
    const match = await Match.findById(req.params.id)
      .populate('teamA teamB tournament innings.battingTeam innings.bowlingTeam winnerTeam')
      .lean();
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    const first = match.innings[0];
    const second = match.innings[1];

    const current =
      match.currentInningsIndex === 0
        ? first
        : second;

    const crr = computeRunRate(current.runs, current.overs, current.ballsInOver);

    let rrr: number | null = null;
    if (match.currentInningsIndex === 1) {
      const target = first.runs + 1;
      const runsNeeded = target - second.runs;
      const ballsRemaining =
        (match.oversLimit ? match.oversLimit * 6 : 0) - (second.overs * 6 + second.ballsInOver);
      if (ballsRemaining > 0 && runsNeeded > 0) {
        rrr = Number(((runsNeeded / ballsRemaining) * 6).toFixed(2));
      }
    }

    res.json({
      match,
      currentRunRate: crr,
      requiredRunRate: rrr
    });
  });

  app.get('/api/matches/:id/balls', async (req, res) => {
    const balls = await Ball.find({ match: req.params.id })
      .sort({ createdAt: 1 })
      .populate('striker nonStriker bowler playerOut');
    res.json(balls);
  });

  app.get('/api/matches/:id/players', async (req, res) => {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }
    const teamIds = [match.teamA, match.teamB];
    const players = await Player.find({ teams: { $in: teamIds } });
    res.json(players);
  });

  app.get('/api/matches/history/completed', async (_req, res) => {
    const matches = await Match.find({ isCompleted: true }).sort({ updatedAt: -1 }).populate('teamA teamB tournament');
    res.json(matches);
  });

  app.get('/api/awards/:tournamentId', async (req, res) => {
    const awards = await Award.find({ tournament: req.params.tournamentId }).populate('player match');
    res.json(awards);
  });

  app.post('/api/awards/:tournamentId', requirePassword, async (req, res) => {
    const { type, playerId, matchId } = req.body as { type: string; playerId: string; matchId?: string };
    const award = await Award.create({
      tournament: req.params.tournamentId,
      type,
      player: playerId,
      match: matchId
    });
    res.json(await award.populate('player match'));
  });

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Crickloom backend listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', err);
  process.exit(1);
});

