import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import dotenv from "dotenv";

import {
  BuzzerState,
  Game,
  HostState,
  ParticipantState,
  ParticipantView,
  Player,
  QuestionState,
  Tournament,
} from "./types";
import { shuffleArray } from "./shuffleArray";

dotenv.config();

// The server never crashes because of a single bad message – a crash would
// restart the process and wipe every tournament kept in memory.
process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION (server keeps running)", error);
});
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION (server keeps running)", reason);
});

const app = express();
const port = process.env.PORT || 3123;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  // Players send their photo (base64) over the socket. The default limit is
  // 1 MB and a bigger message makes the server drop the whole connection.
  maxHttpBufferSize: 5e6,
  // Be a bit more forgiving for phones on flaky Wi-Fi / mobile data.
  pingInterval: 25000,
  pingTimeout: 30000,
});

app.get("/", (_req, res) => {
  res.send("OK");
});

const log = (...args: unknown[]) =>
  console.log(new Date().toISOString(), ...args);

// Host
//tournament
const SEND_CREATE_TOURNAMENT = "sendCreateTournament";
const RECONNECT_HOST = "reconnectHost";
const RETURN_HOST_STATE = "returnHostState";
const RETURN_NEW_TOURNAMENT = "returnNewTournament";
const RETURN_NEW_GAMES = "returnNewGames";
const RETURN_CURRENT_GAME_ID = "returnCurrentGameId";
const RETURN_NEW_PLAYERS = "returnNewPlayers";
const RETURN_CONNECTED_PLAYERS = "returnConnectedPlayers";
const SEND_START_TOURNAMENT = "sendStartTournament";
// Host changes how many players play in each qualifying game
const SEND_SET_GAME_SIZES = "sendSetGameSizes";
const RETURN_GAME_SIZES = "returnGameSizes";
const SEND_REMOVE_PLAYER = "sendRemovePlayer";

//games
const SEND_START_GAME = "sendStartGame";
const SEND_PROCEED_TO_THE_NEXT_GAME = "sendProceedToTheNextGame";

//final_game
const RETURN_UPDATED_FINAL_GAME = "returnUpdatedFinalGame";
const RETURN_NEXT_GAME_IS_FINAL = "returnNextGameIsFinal";

//questions
const SEND_OPEN_QUESTION = "sendOpenQuestion";
const SEND_START_QUESTION = "sendStartQuestion";
const RETURN_ANSWER_QUESTION = "returnAnswerQuestion";
const SEND_ANSWER_JUDGED = "sendAnswerJudged";
const SEND_NO_ANSWER = "sendNoAnswer";
const SEND_CANCEL_QUESTION = "sendCancelQuestion";
const RETURN_SCORES = "returnScores";

//final question
const SEND_START_FINAL_QUESTION = "sendStartFinalQuestion";
const RETURN_BETS_STATUS = "returnBetsStatus";
const SEND_SHOW_FINAL_QUESTION = "sendShowFinalQuestion";
const SEND_FINAL_QUESTION_TIME_OUT = "sendFinalQuestionTimeOut";
const RETURN_FINAL_QUESTION_ANSWERS = "returnFinalQuestionAnswers";
const SEND_CORRECT_FINAL_ANSWER = "sendCorrectFinalAnswer";
const SEND_INCORRECT_FINAL_ANSWER = "sendIncorrectFinalAnswer";

// ---------------------------MMMM--------------------------------------
// -------------------------O-X--X-O--------------------------------------
// ---------------------------oooo----------------------------------------
// -------------------------/- ||--\-----------------------------------
// ------------------------""--||--""-----------------------------------

// PARTICIPANT
//tournament
const SEND_JOIN_TOURNAMENT = "sendJoinTournament";
const RETURN_JOIN_TOURNAMENT = "returnJoinTournament";
const RECONNECT_PARTICIPANT = "reconnectParticipant";
// Full participant state – the participant app renders everything from it
const RETURN_PLAYER_STATE = "returnPlayerState";

//questions
const SEND_ANSWER_QUESTION = "sendAnswerQuestion";

//final question
const SEND_BET_AMOUNT = "sendBetAmount";
const SEND_FINAL_QUESTION_ANSWER = "sendFinalQuestionAnswer";

// COMMON
const RETURN_START_TOURNAMENT = "returnStartTournament";
const RETURN_START_GAME = "returnStartGame";

const DEFAULT_TOURNAMENT_ID = "Test";
const PLAYERS_COUNT = Number(process.env.PLAYERS_COUNT) || 3;
// Default size of a qualifying game – the host can change the size of every
// game in the lobby (e.g. 5 | 5 | 6).
const DEFAULT_GAME_PLAYERS_COUNT = 3;
const MIN_GAME_PLAYERS_COUNT = 1;
const MAX_GAME_PLAYERS_COUNT = 12;
const GAMES_COUNT = Math.max(
  1,
  Math.floor(PLAYERS_COUNT / DEFAULT_GAME_PLAYERS_COUNT)
);
const DEFAULT_GAME_SIZES: number[] = new Array(GAMES_COUNT).fill(
  DEFAULT_GAME_PLAYERS_COUNT
);

const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);
// Answers to the final question that arrive just after the time is up
// (network lag) are still accepted.
const FINAL_ANSWER_GRACE_MS = 3000;

const tournaments: Record<string, Tournament> = {};

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

// Every client joins a room instead of us keeping references to sockets.
// A reconnected client gets a new socket, joins the same room again and
// immediately receives everything that is sent to it.
const hostRoom = (tournamentId: string) => `host:${tournamentId}`;
const playerRoom = (playerId: string) => `player:${playerId}`;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const normalizeName = (name: string) => name.trim().toLocaleLowerCase();

const getTournament = (tournamentId: unknown): Tournament | undefined =>
  isNonEmptyString(tournamentId) ? tournaments[tournamentId] : undefined;

const findActiveTournamentId = (): string | null =>
  Object.values(tournaments).find((tournament) => !tournament.isFinished)?.id ??
  null;

const createEmptyGame = (gameId: string, players: Player[]): Game => ({
  gameId,
  isStarted: false,
  isFinished: false,
  players,
  finalQuestionInfos: {},
  answeredQuestionIds: [],
  questionSeq: 0,
  question: null,
  finalQuestionPhase: null,
  finalQuestionStartedAt: null,
  finalQuestionTimeUpAt: null,
});

const toGamePlayer = (player: Player): Player => ({
  id: player.id,
  name: player.name,
  base64Photo: player.base64Photo,
  score: 0,
  isAnswering: false,
  wasAlreadyAnswering: false,
});

const createTournament = (tournamentId: string): Tournament => ({
  id: tournamentId,
  players: [],
  games: {},
  finalGame: createEmptyGame("finalGame", []),
  playersCount: sum(DEFAULT_GAME_SIZES),
  gamesCount: GAMES_COUNT,
  gameSizes: [...DEFAULT_GAME_SIZES],
  isOpen: true,
  isStarted: false,
  isFinished: false,
  currentGameIndex: null,
  currentGameId: null,
  isFinalGame: false,
});

const createGames = (
  players: Player[],
  gameSizes: number[]
): Record<string, Game> => {
  const shuffledPlayers = shuffleArray(players);
  let firstPlayerIndex = 0;
  return Object.fromEntries(
    gameSizes.map((gameSize, index) => {
      const gameId = `game${index + 1}`;
      const gamePlayers = shuffledPlayers
        .slice(firstPlayerIndex, firstPlayerIndex + gameSize)
        .map(toGamePlayer);
      firstPlayerIndex += gameSize;
      return [gameId, createEmptyGame(gameId, gamePlayers)];
    })
  );
};

// The game that is played right now (qualifying game or the final)
const getActiveGame = (tournament: Tournament): Game | undefined => {
  if (tournament.isFinalGame) {
    return tournament.finalGame;
  }
  return tournament.currentGameId
    ? tournament.games[tournament.currentGameId]
    : undefined;
};

const findQualifyingGame = (tournament: Tournament, playerId: string) =>
  Object.values(tournament.games).find((game) =>
    game.players.some((player) => player.id === playerId)
  );

const isPlayerConnected = (playerId: string) =>
  (io.sockets.adapter.rooms.get(playerRoom(playerId))?.size ?? 0) > 0;

const getConnectedPlayerIds = (tournament: Tournament) =>
  tournament.players
    .filter((player) => isPlayerConnected(player.id))
    .map((player) => player.id);

const getBetsCount = (game: Game) =>
  game.players.filter((player) => game.finalQuestionInfos[player.id]).length;

const getBuzzerState = (game: Game, playerId: string): BuzzerState => {
  const question = game.question;
  if (!question || !question.isStarted) return "closed";
  if (question.answeringPlayerId === playerId) return "answering";
  if (question.triedPlayerIds.includes(playerId)) return "answeredWrongly";
  if (question.answeringPlayerId) return "blocked";
  return question.isOpen ? "open" : "closed";
};

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

const getParticipantState = (
  tournament: Tournament,
  playerId: string
): ParticipantState | null => {
  const player = tournament.players.find((player) => player.id === playerId);
  if (!player) {
    return null;
  }

  const qualifyingGame = findQualifyingGame(tournament, playerId);
  const isFinalist = tournament.finalGame.players.some(
    (finalist) => finalist.id === playerId
  );

  let view: ParticipantView = "lobby";
  // The game the player currently plays / played last
  let game: Game | undefined = qualifyingGame;

  if (!tournament.isStarted) {
    view = "lobby";
  } else if (isFinalist) {
    if (tournament.isFinalGame) {
      game = tournament.finalGame;
      if (game.isFinished) {
        view = game.winnerId === playerId ? "tournamentWinner" : "loser";
      } else {
        view = game.finalQuestionPhase ? "finalQuestion" : "game";
      }
    } else {
      view = "gameWinner";
    }
  } else if (qualifyingGame) {
    if (qualifyingGame.isFinished) {
      view = "loser";
    } else if (qualifyingGame.isStarted) {
      view = qualifyingGame.finalQuestionPhase ? "finalQuestion" : "game";
    } else {
      view = "lobby";
    }
  }

  const isActiveGame = !!game && getActiveGame(tournament) === game;
  const gamePlayer = game?.players.find((player) => player.id === playerId);
  const finalQuestionInfo = game?.finalQuestionInfos[playerId];

  return {
    tournamentId: tournament.id,
    playerId,
    name: player.name,
    view,
    isTournamentStarted: tournament.isStarted,
    gameId: game?.gameId ?? null,
    score: gamePlayer?.score ?? 0,
    buzzer:
      game && isActiveGame && view === "game"
        ? getBuzzerState(game, playerId)
        : "closed",
    questionSeq: game?.questionSeq ?? 0,
    finalQuestion: {
      phase: (isActiveGame && game?.finalQuestionPhase) || null,
      hasBet: !!finalQuestionInfo,
      betAmount: finalQuestionInfo?.betAmount ?? null,
      hasAnswered: !!finalQuestionInfo?.hasAnswered,
      answer: finalQuestionInfo?.hasAnswered ? finalQuestionInfo.answer : null,
      isCorrect: finalQuestionInfo?.isCorrect ?? null,
    },
  };
};

const getHostState = (tournament: Tournament): HostState => {
  const activeGame = getActiveGame(tournament);
  return {
    tournamentId: tournament.id,
    playersCount: tournament.playersCount,
    gameSizes: tournament.gameSizes,
    players: tournament.players,
    games: tournament.games,
    finalGame: tournament.finalGame,
    isStarted: tournament.isStarted,
    isFinal: tournament.isFinalGame,
    currentGameId: tournament.currentGameId,
    currentGameIndex: tournament.currentGameIndex,
    finalQuestionElapsedMs:
      activeGame?.finalQuestionPhase === "answering" &&
      activeGame.finalQuestionStartedAt
        ? Date.now() - activeGame.finalQuestionStartedAt
        : null,
    betsCount: activeGame ? getBetsCount(activeGame) : 0,
    connectedPlayerIds: getConnectedPlayerIds(tournament),
  };
};

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

const emitToHost = (
  tournament: Tournament,
  event: string,
  payload?: unknown
) => {
  log(`-> host [${tournament.id}]`, event);
  io.to(hostRoom(tournament.id)).emit(event, payload);
};

const syncPlayer = (tournament: Tournament, playerId: string) => {
  io.to(playerRoom(playerId)).emit(
    RETURN_PLAYER_STATE,
    getParticipantState(tournament, playerId)
  );
};

const syncPlayers = (tournament: Tournament, players = tournament.players) => {
  players.forEach((player) => syncPlayer(tournament, player.id));
};

const emitScores = (tournament: Tournament, game: Game) => {
  emitToHost(tournament, RETURN_SCORES, {
    gameId: game.gameId,
    scores: Object.fromEntries(
      game.players.map((player) => [player.id, player.score])
    ),
  });
};

const emitBetsStatus = (tournament: Tournament, game: Game) => {
  const betsCount = getBetsCount(game);
  emitToHost(tournament, RETURN_BETS_STATUS, {
    betsCount,
    playersCount: game.players.length,
    allBetsSent: betsCount >= game.players.length,
  });
};

const emitConnectedPlayers = (tournament: Tournament) => {
  io.to(hostRoom(tournament.id)).emit(
    RETURN_CONNECTED_PLAYERS,
    getConnectedPlayerIds(tournament)
  );
};

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

// Wraps a handler so that an exception (e.g. a malformed payload or a message
// that arrived in an unexpected moment) is only logged.
const handle = (
  socket: Socket,
  event: string,
  handler: (payload: any) => void
) => {
  socket.on(event, (payload: unknown) => {
    try {
      handler(payload ?? {});
    } catch (error) {
      console.error(`[${event}] handler failed`, error);
    }
  });
};

const onConnection = (socket: Socket) => {
  log(
    "connected",
    socket.id,
    "transport:",
    socket.conn.transport.name,
    "address:",
    socket.handshake.address
  );

  socket.conn.on("upgrade", () => {
    log("upgraded to", socket.conn.transport.name, socket.id);
  });

  socket.on("disconnect", (reason) => {
    log(
      "disconnected",
      socket.id,
      "reason:",
      reason,
      socket.data.playerId
        ? `player: ${socket.data.playerId}`
        : socket.data.hostTournamentId
        ? `host of: ${socket.data.hostTournamentId}`
        : ""
    );
    const tournament = getTournament(socket.data.tournamentId);
    if (tournament && socket.data.playerId) {
      emitConnectedPlayers(tournament);
    }
  });

  // Makes sure that the socket of the host receives messages of its tournament
  const bindHost = (tournament: Tournament) => {
    if (
      socket.data.hostTournamentId &&
      socket.data.hostTournamentId !== tournament.id
    ) {
      socket.leave(hostRoom(socket.data.hostTournamentId));
    }
    socket.data.hostTournamentId = tournament.id;
    socket.join(hostRoom(tournament.id));
  };

  const getHostTournament = (tournamentId: unknown) => {
    const tournament =
      getTournament(tournamentId) ??
      getTournament(socket.data.hostTournamentId);
    if (!tournament) {
      log("host action for unknown tournament", tournamentId);
      socket.emit(RETURN_HOST_STATE, {
        state: null,
        activeTournamentId: findActiveTournamentId(),
      });
      return undefined;
    }
    bindHost(tournament);
    return tournament;
  };

  // Makes sure that the socket of the player receives its state
  const bindParticipant = (tournament: Tournament, playerId: string) => {
    if (socket.data.playerId && socket.data.playerId !== playerId) {
      socket.leave(playerRoom(socket.data.playerId));
    }
    const wasInRoom = socket.rooms.has(playerRoom(playerId));
    socket.data.playerId = playerId;
    socket.data.tournamentId = tournament.id;
    socket.join(playerRoom(playerId));
    if (!wasInRoom) {
      emitConnectedPlayers(tournament);
    }
  };

  const getParticipantTournament = (
    tournamentId: unknown,
    playerId: unknown
  ) => {
    const tournament =
      getTournament(tournamentId) ?? getTournament(socket.data.tournamentId);
    if (!tournament || !isNonEmptyString(playerId)) {
      socket.emit(RETURN_PLAYER_STATE, null);
      return undefined;
    }
    if (!tournament.players.some((player) => player.id === playerId)) {
      socket.emit(RETURN_PLAYER_STATE, null);
      return undefined;
    }
    bindParticipant(tournament, playerId);
    return tournament;
  };

  // *****************************************************************
  // HOST handlers
  // *****************************************************************

  // TOURNAMENT
  //---------------------------------------------
  handle(socket, SEND_CREATE_TOURNAMENT, () => {
    const tournamentId = DEFAULT_TOURNAMENT_ID;
    const previousTournament = tournaments[tournamentId];
    const tournament = createTournament(tournamentId);
    tournaments[tournamentId] = tournament;
    log("Tournament created", tournamentId);

    // Players of the replaced tournament go back to the join screen
    previousTournament?.players.forEach((player) =>
      io.to(playerRoom(player.id)).emit(RETURN_PLAYER_STATE, null)
    );

    bindHost(tournament);
    emitToHost(tournament, RETURN_NEW_TOURNAMENT, {
      tournamentId,
      playersCount: tournament.playersCount,
      gameSizes: tournament.gameSizes,
    });
    emitToHost(tournament, RETURN_NEW_PLAYERS, tournament.players);
  });

  handle(socket, RECONNECT_HOST, ({ tournamentId }) => {
    const tournament = getTournament(tournamentId);
    if (!tournament || tournament.isFinished) {
      socket.emit(RETURN_HOST_STATE, {
        state: null,
        activeTournamentId: findActiveTournamentId(),
      });
      return;
    }
    log("Host reconnected", tournament.id, socket.id);
    bindHost(tournament);
    socket.emit(RETURN_HOST_STATE, {
      state: getHostState(tournament),
      activeTournamentId: tournament.id,
    });
  });

  handle(socket, SEND_START_TOURNAMENT, ({ tournamentId }) => {
    const tournament = getHostTournament(tournamentId);
    if (!tournament) return;

    if (tournament.isStarted) {
      // e.g. double click – just bring the host to the right screen
      emitToHost(tournament, RETURN_START_TOURNAMENT);
      return;
    }
    if (tournament.players.length !== tournament.playersCount) {
      log("Cannot start – wrong number of players", tournament.players.length);
      return;
    }

    log("Starting tournament", tournament.id);
    tournament.isStarted = true;
    tournament.isOpen = false;
    tournament.games = createGames(tournament.players, tournament.gameSizes);
    tournament.currentGameIndex = 0;
    tournament.currentGameId = Object.keys(tournament.games)[0] ?? null;

    const currentGame = getActiveGame(tournament);
    emitToHost(tournament, RETURN_NEW_GAMES, tournament.games);
    emitToHost(tournament, RETURN_CURRENT_GAME_ID, {
      currentGameId: tournament.currentGameId,
      currentGameIndex: tournament.currentGameIndex,
      players: currentGame?.players ?? [],
    });
    emitToHost(tournament, RETURN_START_TOURNAMENT);
    syncPlayers(tournament);
  });

  handle(socket, SEND_SET_GAME_SIZES, ({ tournamentId, gameSizes }) => {
    const tournament = getHostTournament(tournamentId);
    if (!tournament) return;

    const isValid =
      !tournament.isStarted &&
      Array.isArray(gameSizes) &&
      gameSizes.length === tournament.gamesCount &&
      gameSizes.every(
        (gameSize) =>
          Number.isInteger(gameSize) &&
          gameSize >= MIN_GAME_PLAYERS_COUNT &&
          gameSize <= MAX_GAME_PLAYERS_COUNT
      ) &&
      // players who already joined must still fit
      sum(gameSizes) >= tournament.players.length;

    if (isValid) {
      tournament.gameSizes = [...gameSizes];
      tournament.playersCount = sum(gameSizes);
      log("Game sizes changed", tournament.gameSizes.join(" | "));
    } else {
      log("Rejected game sizes", gameSizes);
    }
    // Always answer, so that the host shows what the server really has
    emitToHost(tournament, RETURN_GAME_SIZES, {
      playersCount: tournament.playersCount,
      gameSizes: tournament.gameSizes,
    });
  });

  handle(socket, SEND_REMOVE_PLAYER, ({ tournamentId, playerId }) => {
    const tournament = getHostTournament(tournamentId);
    if (!tournament || tournament.isStarted) return;

    tournament.players = tournament.players.filter(
      (player) => player.id !== playerId
    );
    log("Player removed", playerId);
    io.to(playerRoom(playerId)).emit(RETURN_PLAYER_STATE, null);
    emitToHost(tournament, RETURN_NEW_PLAYERS, tournament.players);
    emitConnectedPlayers(tournament);
  });

  // GAMES
  //---------------------------------------------
  handle(socket, SEND_START_GAME, ({ tournamentId }) => {
    const tournament = getHostTournament(tournamentId);
    if (!tournament) return;
    const game = getActiveGame(tournament);
    if (!game) {
      log(SEND_START_GAME, "NO ACTIVE GAME");
      return;
    }

    log("Starting game", game.gameId);
    game.isStarted = true;
    emitToHost(tournament, RETURN_START_GAME);
    syncPlayers(tournament, game.players);
  });

  handle(
    socket,
    SEND_PROCEED_TO_THE_NEXT_GAME,
    ({ tournamentId, gameId, winnerId }) => {
      const tournament = getHostTournament(tournamentId);
      if (!tournament) return;
      const finishedGame = getActiveGame(tournament);
      if (
        !finishedGame ||
        finishedGame.isFinished ||
        // A second click would otherwise finish the next game right away
        (isNonEmptyString(gameId) && gameId !== finishedGame.gameId)
      ) {
        log(SEND_PROCEED_TO_THE_NEXT_GAME, "ignored", gameId);
        return;
      }

      // Trust the host, but fall back to the best score kept on the server
      const winner =
        finishedGame.players.find((player) => player.id === winnerId) ??
        [...finishedGame.players].sort((p1, p2) => p2.score - p1.score)[0];

      finishedGame.isFinished = true;
      finishedGame.winnerId = winner?.id;
      finishedGame.question = null;
      log("Game finished", finishedGame.gameId, "winner", winner?.id);

      if (tournament.isFinalGame) {
        tournament.isFinished = true;
        syncPlayers(tournament);
        return;
      }

      if (
        winner &&
        !tournament.finalGame.players.some((player) => player.id === winner.id)
      ) {
        tournament.finalGame.players.push(toGamePlayer(winner));
      }
      emitToHost(tournament, RETURN_UPDATED_FINAL_GAME, {
        finalGame: tournament.finalGame,
      });

      const gamesIds = Object.keys(tournament.games);
      const isLastGameFinished =
        (tournament.currentGameIndex ?? 0) >= gamesIds.length - 1;

      if (isLastGameFinished) {
        tournament.isFinalGame = true;
        emitToHost(tournament, RETURN_NEXT_GAME_IS_FINAL, {
          finalGame: tournament.finalGame,
        });
      } else {
        tournament.currentGameIndex = (tournament.currentGameIndex ?? 0) + 1;
        tournament.currentGameId = gamesIds[tournament.currentGameIndex];
        emitToHost(tournament, RETURN_CURRENT_GAME_ID, {
          currentGameId: tournament.currentGameId,
          currentGameIndex: tournament.currentGameIndex,
          players: tournament.games[tournament.currentGameId].players,
        });
      }

      emitToHost(tournament, RETURN_NEW_GAMES, tournament.games);
      syncPlayers(tournament);
    }
  );

  // QUESTIONS
  //---------------------------------------------
  // Host opened a question from the board
  handle(socket, SEND_OPEN_QUESTION, ({ tournamentId, questionId }) => {
    const tournament = getHostTournament(tournamentId);
    if (!tournament || !isNonEmptyString(questionId)) return;
    const game = getActiveGame(tournament);
    if (!game) return;

    if (!game.answeredQuestionIds.includes(questionId)) {
      game.answeredQuestionIds.push(questionId);
    }
    game.questionSeq += 1;
    game.question = {
      id: questionId,
      isStarted: false,
      isOpen: false,
      answeringPlayerId: null,
      triedPlayerIds: [],
    };
    syncPlayers(tournament, game.players);
  });

  // Host clicked "play" – buzzers are open
  handle(socket, SEND_START_QUESTION, ({ tournamentId }) => {
    const tournament = getHostTournament(tournamentId);
    if (!tournament) return;
    const game = getActiveGame(tournament);
    if (!game) return;

    const question: QuestionState = {
      id: game.question?.id ?? null,
      isStarted: true,
      isOpen: true,
      answeringPlayerId: null,
      triedPlayerIds: [],
    };
    game.question = question;
    game.questionSeq += 1;
    game.players = game.players.map((player) => ({
      ...player,
      wasAlreadyAnswering: false,
      isAnswering: false,
    }));
    log("Question started", question.id, "seq", game.questionSeq);
    syncPlayers(tournament, game.players);
  });

  // Host judged the answer of the answering player
  handle(
    socket,
    SEND_ANSWER_JUDGED,
    ({ tournamentId, playerId, isCorrect, points }) => {
      const tournament = getHostTournament(tournamentId);
      if (!tournament) return;
      const game = getActiveGame(tournament);
      const question = game?.question;
      if (!game || !question) return;

      // Only the player that is answering can be judged – protects from
      // double clicks and from messages that arrive late.
      if (question.answeringPlayerId !== playerId) {
        log(SEND_ANSWER_JUDGED, "ignored – player is not answering", playerId);
        return;
      }

      const questionPoints = Math.abs(Number(points)) || 0;
      game.players = game.players.map((player) =>
        player.id === playerId
          ? {
              ...player,
              score:
                player.score + (isCorrect ? questionPoints : -questionPoints),
              isAnswering: false,
              wasAlreadyAnswering: true,
            }
          : player
      );

      if (isCorrect) {
        game.question = null;
      } else {
        question.answeringPlayerId = null;
        question.triedPlayerIds.push(playerId);
        question.isOpen = game.players.some(
          (player) => !question.triedPlayerIds.includes(player.id)
        );
      }
      log("Answer judged", playerId, isCorrect ? "correct" : "wrong");

      emitScores(tournament, game);
      syncPlayers(tournament, game.players);
    }
  );

  // Host closed the question – nobody answered it ("no answer" button)
  handle(socket, SEND_NO_ANSWER, ({ tournamentId }) => {
    const tournament = getHostTournament(tournamentId);
    if (!tournament) return;
    const game = getActiveGame(tournament);
    if (!game) return;

    game.question = null;
    syncPlayers(tournament, game.players);
  });

  // Host went back to the board (e.g. a misclick) – the question stays
  // available on the board
  handle(socket, SEND_CANCEL_QUESTION, ({ tournamentId }) => {
    const tournament = getHostTournament(tournamentId);
    if (!tournament) return;
    const game = getActiveGame(tournament);
    if (!game) return;

    const questionId = game.question?.id;
    if (questionId) {
      game.answeredQuestionIds = game.answeredQuestionIds.filter(
        (answeredQuestionId) => answeredQuestionId !== questionId
      );
    }
    game.question = null;
    game.questionSeq += 1;
    syncPlayers(tournament, game.players);
  });

  // FINAL QUESTION
  //---------------------------------------------
  handle(socket, SEND_START_FINAL_QUESTION, ({ tournamentId }) => {
    const tournament = getHostTournament(tournamentId);
    if (!tournament) return;
    const game = getActiveGame(tournament);
    if (!game) return;

    if (!game.finalQuestionPhase) {
      game.finalQuestionPhase = "betting";
      game.isFinalQuestionStarted = true;
      game.question = null;
      log("Final question – betting", game.gameId);
    }
    emitBetsStatus(tournament, game);
    syncPlayers(tournament, game.players);
  });

  handle(socket, SEND_SHOW_FINAL_QUESTION, ({ tournamentId }) => {
    const tournament = getHostTournament(tournamentId);
    if (!tournament) return;
    const game = getActiveGame(tournament);
    if (!game) return;

    if (game.finalQuestionPhase === "betting") {
      // Players that did not bet (e.g. lost connection) bet 0
      game.players.forEach((player) => {
        if (!game.finalQuestionInfos[player.id]) {
          game.finalQuestionInfos[player.id] = {
            playerId: player.id,
            betAmount: 0,
            answer: "",
            hasAnswered: false,
          };
        }
      });
      game.finalQuestionPhase = "answering";
      game.finalQuestionStartedAt = Date.now();
      log("Final question – answering", game.gameId);
    }
    syncPlayers(tournament, game.players);
  });

  handle(socket, SEND_FINAL_QUESTION_TIME_OUT, ({ tournamentId }) => {
    const tournament = getHostTournament(tournamentId);
    if (!tournament) return;
    const game = getActiveGame(tournament);
    if (!game) return;

    if (game.finalQuestionPhase === "answering") {
      game.finalQuestionPhase = "timeUp";
      game.finalQuestionTimeUpAt = Date.now();
      game.isFinalQuestionStarted = false;
      log("Final question – time up", game.gameId);
    }
    emitToHost(tournament, RETURN_FINAL_QUESTION_ANSWERS, {
      finalQuestionInfos: game.finalQuestionInfos,
    });
    syncPlayers(tournament, game.players);
  });

  const judgeFinalAnswer = (
    tournamentId: unknown,
    playerId: unknown,
    isCorrect: boolean
  ) => {
    const tournament = getHostTournament(tournamentId);
    if (!tournament || !isNonEmptyString(playerId)) return;
    const game = getActiveGame(tournament);
    const info = game?.finalQuestionInfos[playerId];
    if (!game || !info) return;
    if (info.isCorrect !== undefined) {
      // Already judged (double click)
      return;
    }

    info.isCorrect = isCorrect;
    game.players = game.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            score:
              player.score + (isCorrect ? info.betAmount : -info.betAmount),
          }
        : player
    );
    emitScores(tournament, game);
    emitToHost(tournament, RETURN_FINAL_QUESTION_ANSWERS, {
      finalQuestionInfos: game.finalQuestionInfos,
    });
    syncPlayer(tournament, playerId);
  };

  handle(socket, SEND_CORRECT_FINAL_ANSWER, ({ tournamentId, playerId }) =>
    judgeFinalAnswer(tournamentId, playerId, true)
  );
  handle(socket, SEND_INCORRECT_FINAL_ANSWER, ({ tournamentId, playerId }) =>
    judgeFinalAnswer(tournamentId, playerId, false)
  );

  // *****************************************************************
  // PARTICIPANT handlers
  // *****************************************************************

  handle(socket, RECONNECT_PARTICIPANT, (payload) => {
    // Older clients sent only the playerId
    const { playerId, tournamentId } =
      typeof payload === "string"
        ? { playerId: payload, tournamentId: DEFAULT_TOURNAMENT_ID }
        : payload;

    const tournament = getParticipantTournament(tournamentId, playerId);
    if (!tournament) return;
    log("Participant reconnected", playerId, socket.id);
    socket.emit(RETURN_PLAYER_STATE, getParticipantState(tournament, playerId));
  });

  // TOURNAMENT
  //---------------------------------------------
  handle(
    socket,
    SEND_JOIN_TOURNAMENT,
    ({ tournamentId, playerName, base64Photo, playerId }) => {
      const reply = (
        success: boolean,
        reason?: string,
        joinedPlayerId?: string
      ) =>
        socket.emit(RETURN_JOIN_TOURNAMENT, {
          success,
          reason,
          playerId: joinedPlayerId,
          tournamentId,
        });

      const tournament = getTournament(tournamentId);
      const name = String(playerName ?? "")
        .trim()
        .slice(0, 40);
      if (!tournament || tournament.isFinished) return reply(false, "notFound");
      if (!isNonEmptyString(playerId) || !name) return reply(false, "invalid");

      let player = tournament.players.find((player) => player.id === playerId);
      let isNewPlayer = false;

      if (!player) {
        // Same name = the same person coming back from another browser or
        // after losing the local storage – take over the old player.
        const sameNamePlayer = tournament.players.find(
          (player) => normalizeName(player.name) === normalizeName(name)
        );
        if (sameNamePlayer) {
          if (isPlayerConnected(sameNamePlayer.id)) {
            return reply(false, "nameTaken");
          }
          player = sameNamePlayer;
          log("Player rejoined by name", name, player.id);
        }
      }

      if (!player) {
        if (!tournament.isOpen) return reply(false, "started");
        if (tournament.players.length >= tournament.playersCount) {
          return reply(false, "full");
        }
        player = {
          id: playerId,
          score: 0,
          name,
          isAnswering: false,
          wasAlreadyAnswering: false,
          base64Photo: typeof base64Photo === "string" ? base64Photo : "",
        };
        tournament.players.push(player);
        isNewPlayer = true;
        log("Player joined", name, playerId);
      } else if (tournament.isOpen) {
        // Still in the lobby – allow changing name / photo
        player.name = name;
        if (isNonEmptyString(base64Photo)) {
          player.base64Photo = base64Photo;
        }
      }

      bindParticipant(tournament, player.id);
      reply(true, undefined, player.id);
      if (isNewPlayer || tournament.isOpen) {
        emitToHost(tournament, RETURN_NEW_PLAYERS, tournament.players);
      }
      syncPlayer(tournament, player.id);
    }
  );

  // QUESTION
  //---------------------------------------------
  handle(
    socket,
    SEND_ANSWER_QUESTION,
    ({ tournamentId, playerId, questionSeq }) => {
      const tournament = getParticipantTournament(tournamentId, playerId);
      if (!tournament) return;
      const game = getActiveGame(tournament);
      const question = game?.question;

      const isAccepted =
        !!game &&
        !!question &&
        question.isStarted &&
        question.isOpen &&
        !question.answeringPlayerId &&
        !question.triedPlayerIds.includes(playerId) &&
        game.players.some((player) => player.id === playerId) &&
        (questionSeq === undefined || questionSeq === game.questionSeq);

      if (!game || !question || !isAccepted) {
        // Somebody else was faster or the question is closed – send the
        // real state so the buzzer goes back to the right state.
        log("Buzz rejected", playerId);
        syncPlayer(tournament, playerId);
        return;
      }

      question.isOpen = false;
      question.answeringPlayerId = playerId;
      game.players = game.players.map((player) => ({
        ...player,
        isAnswering: player.id === playerId,
      }));
      log("Buzz accepted", playerId);

      emitToHost(tournament, RETURN_ANSWER_QUESTION, { playerId });
      syncPlayers(tournament, game.players);
    }
  );

  // FINAL QUESTION
  //---------------------------------------------
  handle(socket, SEND_BET_AMOUNT, ({ tournamentId, betAmount, playerId }) => {
    const tournament = getParticipantTournament(tournamentId, playerId);
    if (!tournament) return;
    const game = getActiveGame(tournament);
    const player = game?.players.find((player) => player.id === playerId);

    if (
      !game ||
      !player ||
      game.finalQuestionPhase !== "betting" ||
      game.finalQuestionInfos[playerId]
    ) {
      syncPlayer(tournament, playerId);
      return;
    }

    const maxBet = Math.max(player.score, 0);
    const parsedBet = Math.floor(Number(betAmount)) || 0;
    game.finalQuestionInfos[playerId] = {
      playerId,
      betAmount: Math.min(Math.max(parsedBet, 0), maxBet),
      answer: "",
      hasAnswered: false,
    };
    log("Bet", playerId, game.finalQuestionInfos[playerId].betAmount);

    emitBetsStatus(tournament, game);
    syncPlayer(tournament, playerId);
  });

  handle(
    socket,
    SEND_FINAL_QUESTION_ANSWER,
    ({ tournamentId, answer, playerId }) => {
      const tournament = getParticipantTournament(tournamentId, playerId);
      if (!tournament) return;
      const game = getActiveGame(tournament);
      const info = game?.finalQuestionInfos[playerId];

      const isLateButAccepted =
        game?.finalQuestionPhase === "timeUp" &&
        !!game.finalQuestionTimeUpAt &&
        Date.now() - game.finalQuestionTimeUpAt < FINAL_ANSWER_GRACE_MS;

      if (
        !game ||
        !info ||
        info.hasAnswered ||
        info.isCorrect !== undefined ||
        (game.finalQuestionPhase !== "answering" && !isLateButAccepted)
      ) {
        syncPlayer(tournament, playerId);
        return;
      }

      info.answer = String(answer ?? "").slice(0, 500);
      info.hasAnswered = true;
      log("Final answer", playerId);

      if (game.finalQuestionPhase === "timeUp") {
        emitToHost(tournament, RETURN_FINAL_QUESTION_ANSWERS, {
          finalQuestionInfos: game.finalQuestionInfos,
        });
      }
      syncPlayer(tournament, playerId);
    }
  );
};

io.on("connection", onConnection);
io.engine.on("connection_error", (error: any) => {
  log("connection_error", error?.code, error?.message);
});

httpServer.on("error", (error) => {
  // e.g. port already in use – there is nothing to keep alive
  console.error("HTTP server error", error);
  process.exit(1);
});

console.log("IM ALIVE");
console.log(
  "Listening on port: ",
  port,
  "default game sizes:",
  DEFAULT_GAME_SIZES.join(" | ")
);
httpServer.listen(port);
