export type Player = {
  id: string;
  name: string;
  score: number;
  isAnswering: boolean;
  wasAlreadyAnswering?: boolean;
  base64Photo?: string;
};

export type FinalQuestionInfo = {
  answer: string;
  betAmount: number;
  playerId: string;
  hasAnswered?: boolean;
  // undefined = not judged yet
  isCorrect?: boolean;
};

// State of the question that is currently displayed by the host.
export type QuestionState = {
  id: string | null;
  // host clicked "play" – buzzers can be used
  isStarted: boolean;
  // buzzers are open right now (nobody answering, someone still can answer)
  isOpen: boolean;
  answeringPlayerId: string | null;
  // players who already answered wrongly
  triedPlayerIds: string[];
};

export type FinalQuestionPhase = "betting" | "answering" | "timeUp";

export type Game = {
  gameId: string;
  isStarted: boolean;
  isFinished: boolean;
  winnerId?: string;
  players: Player[];
  finalQuestionInfos: Record<string, FinalQuestionInfo>;
  isFinalQuestionStarted?: boolean;

  answeredQuestionIds: string[];
  // increased every time a question is opened/started – stale buzzes are rejected
  questionSeq: number;
  question: QuestionState | null;

  finalQuestionPhase: FinalQuestionPhase | null;
  finalQuestionStartedAt: number | null;
  finalQuestionTimeUpAt: number | null;
};

export type Tournament = {
  id: string;
  players: Player[];
  games: Record<string, Game>;

  finalGame: Game;

  playersCount: number;
  gamesCount: number;
  // number of players in each qualifying game, e.g. [5, 5, 6]
  gameSizes: number[];
  isOpen: boolean;
  isStarted: boolean;
  isFinished: boolean;

  currentGameIndex: number | null;
  currentGameId: string | null;
  isFinalGame: boolean;
};

// ---------------------------------------------------------------------------
// Snapshots sent to clients – everything a client needs to rebuild its screen
// after a reconnect or a page reload.
// ---------------------------------------------------------------------------

export type BuzzerState =
  | "closed"
  | "open"
  | "answering"
  | "blocked"
  | "answeredWrongly";

export type ParticipantView =
  | "lobby"
  | "game"
  | "finalQuestion"
  | "gameWinner"
  | "loser"
  | "tournamentWinner";

export type ParticipantState = {
  tournamentId: string;
  playerId: string;
  name: string;
  view: ParticipantView;
  isTournamentStarted: boolean;
  gameId: string | null;
  score: number;
  buzzer: BuzzerState;
  questionSeq: number;
  finalQuestion: {
    phase: FinalQuestionPhase | null;
    hasBet: boolean;
    betAmount: number | null;
    hasAnswered: boolean;
    answer: string | null;
    isCorrect: boolean | null;
  };
};

export type HostState = {
  tournamentId: string;
  playersCount: number;
  gameSizes: number[];
  players: Player[];
  games: Record<string, Game>;
  finalGame: Game;
  isStarted: boolean;
  isFinal: boolean;
  currentGameId: string | null;
  currentGameIndex: number | null;
  finalQuestionElapsedMs: number | null;
  betsCount: number;
  connectedPlayerIds: string[];
};
