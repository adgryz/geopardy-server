export type Player = {
  id: string;
  name: string;
  score: number;
  isAnswering: boolean;
  wasAlreadyAnswering?: boolean;
};

export type Game = {
  gameId: string;
  isStarted: boolean;
  players: Player[];
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
