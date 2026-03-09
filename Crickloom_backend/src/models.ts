import mongoose, { Schema, Document, Types } from 'mongoose';

export type MatchFormat = 'T20' | 'ODI' | 'TEST';

export interface ITournament extends Document {
  name: string;
  startDate?: Date;
  endDate?: Date;
}

const TournamentSchema = new Schema<ITournament>(
  {
    name: { type: String, required: true },
    startDate: Date,
    endDate: Date
  },
  { timestamps: true }
);

export const Tournament = mongoose.model<ITournament>('Tournament', TournamentSchema);

export interface ITeam extends Document {
  name: string;
  shortName: string;
  tournament: Types.ObjectId;
}

const TeamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true },
    shortName: { type: String, required: true },
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true }
  },
  { timestamps: true }
);

export const Team = mongoose.model<ITeam>('Team', TeamSchema);

export interface IPlayer extends Document {
  name: string;
  photoUrl?: string;
  role?: string;
  teams: Types.ObjectId[];
}

const PlayerSchema = new Schema<IPlayer>(
  {
    name: { type: String, required: true },
    photoUrl: String,
    role: String,
    teams: [{ type: Schema.Types.ObjectId, ref: 'Team' }]
  },
  { timestamps: true }
);

export const Player = mongoose.model<IPlayer>('Player', PlayerSchema);

export type InningStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface IInnings {
  battingTeam: Types.ObjectId;
  bowlingTeam: Types.ObjectId;
  runs: number;
  wickets: number;
  overs: number;
  ballsInOver: number;
  status: InningStatus;
  fallOfWickets: {
    score: number;
    wicket: number;
    over: string;
    playerOut: Types.ObjectId;
    dismissalType: string;
  }[];
}

export interface IMatch extends Document {
  tournament: Types.ObjectId;
  format: MatchFormat;
  title: string;
  teamA: Types.ObjectId;
  teamB: Types.ObjectId;
  oversLimit?: number;
  currentInningsIndex: number;
  innings: IInnings[];
  isCompleted: boolean;
  winnerTeam?: Types.ObjectId;
  winnerEditable: boolean;
}

const InningsSchema = new Schema<IInnings>(
  {
    battingTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    bowlingTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    runs: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    overs: { type: Number, default: 0 },
    ballsInOver: { type: Number, default: 0 },
    status: { type: String, enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'], default: 'NOT_STARTED' },
    fallOfWickets: [
      {
        score: Number,
        wicket: Number,
        over: String,
        playerOut: { type: Schema.Types.ObjectId, ref: 'Player' },
        dismissalType: String
      }
    ]
  },
  { _id: false }
);

const MatchSchema = new Schema<IMatch>(
  {
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    format: { type: String, enum: ['T20', 'ODI', 'TEST'], required: true },
    title: { type: String, required: true },
    teamA: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    teamB: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    oversLimit: Number,
    currentInningsIndex: { type: Number, default: 0 },
    innings: { type: [InningsSchema], default: [] },
    isCompleted: { type: Boolean, default: false },
    winnerTeam: { type: Schema.Types.ObjectId, ref: 'Team' },
    winnerEditable: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Match = mongoose.model<IMatch>('Match', MatchSchema);

export type BallType = 'LEGAL' | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE';

export interface IBall extends Document {
  match: Types.ObjectId;
  inningsIndex: number;
  overNumber: number;
  ballInOver: number;
  striker: Types.ObjectId;
  nonStriker: Types.ObjectId;
  bowler: Types.ObjectId;
  runs: number;
  extras: number;
  ballType: BallType;
  wicketType?: string;
  playerOut?: Types.ObjectId;
}

const BallSchema = new Schema<IBall>(
  {
    match: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
    inningsIndex: { type: Number, required: true },
    overNumber: { type: Number, required: true },
    ballInOver: { type: Number, required: true },
    striker: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    nonStriker: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    bowler: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    runs: { type: Number, default: 0 },
    extras: { type: Number, default: 0 },
    ballType: { type: String, enum: ['LEGAL', 'WIDE', 'NO_BALL', 'BYE', 'LEG_BYE'], default: 'LEGAL' },
    wicketType: String,
    playerOut: { type: Schema.Types.ObjectId, ref: 'Player' }
  },
  { timestamps: true }
);

export const Ball = mongoose.model<IBall>('Ball', BallSchema);

export type StatFormat = 'T20' | 'ODI' | 'TEST';

export interface IPlayerStats extends Document {
  player: Types.ObjectId;
  format: StatFormat;
  // batting
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  dismissals: number;
  // bowling
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  // fielding
  catches: number;
  runOuts: number;
  stumpings: number;
}

const PlayerStatsSchema = new Schema<IPlayerStats>(
  {
    player: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    format: { type: String, enum: ['T20', 'ODI', 'TEST'], required: true },
    runs: { type: Number, default: 0 },
    ballsFaced: { type: Number, default: 0 },
    fours: { type: Number, default: 0 },
    sixes: { type: Number, default: 0 },
    dismissals: { type: Number, default: 0 },
    ballsBowled: { type: Number, default: 0 },
    runsConceded: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    catches: { type: Number, default: 0 },
    runOuts: { type: Number, default: 0 },
    stumpings: { type: Number, default: 0 }
  },
  { timestamps: true }
);

PlayerStatsSchema.index({ player: 1, format: 1 }, { unique: true });

export const PlayerStats = mongoose.model<IPlayerStats>('PlayerStats', PlayerStatsSchema);

export interface IAward extends Document {
  tournament: Types.ObjectId;
  match?: Types.ObjectId;
  type: string;
  player: Types.ObjectId;
}

const AwardSchema = new Schema<IAward>(
  {
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    match: { type: Schema.Types.ObjectId, ref: 'Match' },
    type: { type: String, required: true },
    player: { type: Schema.Types.ObjectId, ref: 'Player', required: true }
  },
  { timestamps: true }
);

export const Award = mongoose.model<IAward>('Award', AwardSchema);

