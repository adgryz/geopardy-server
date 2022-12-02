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
};

export type Game = {
  gameId: string;
  isStarted: boolean;
  players: Player[];
  finalQuestionInfos: Record<string, FinalQuestionInfo>;
  isFinalQuestionStarted?: boolean;
};

export type Tournament = {
  players: Player[];
  games: Record<string, Game>;

  finalGame: Game;

  gamesCount: number;
  singleGamePlayersCount: number;
  isOpen: boolean;
  isStarted: boolean;
};
