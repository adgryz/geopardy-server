export type Player = {
  id: string;
  name: string;
  score: number;
  isAnswering: boolean;
  wasAlreadyAnswering?: boolean;
};

export type Game = {
  isOpen: boolean;
  isStarted: boolean;
  players: Player[];
};
