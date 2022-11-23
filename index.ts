import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import dotenv from "dotenv";

import { Game, Player, Tournament } from "./types";
import { shuffleArray } from "./shuffleArray";
import { ISendPlayerAnsweredWronglyPayload } from "./messagesTypes";

dotenv.config();
const app = express();
const port = 3123;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const sendMsg = (socket: Socket, msg: string, payload?: unknown) => {
  const isHost = socket.id === hostSocket?.id;
  console.log(
    `[${isHost ? "Host" : "Participant " + socket.id}] ", ${msg} with payload ${
      typeof payload === "object"
        ? Object.entries(payload as any).toString()
        : payload
    }`
  );
  socket.emit(msg, payload);
};

// Host
//tournament
const SEND_CREATE_TOURNAMENT = "sendCreateTournament";
const RETURN_NEW_TOURNAMENT = "returnNewTournament";
const RETURN_NEW_GAMES = "returnNewGames";
const RETURN_CURRENT_GAME_ID = "returnCurrentGameId";
const RETURN_NEW_PLAYERS = "returnNewPlayers";
const SEND_START_TOURNAMENT = "sendStartTournament";

//games
const SEND_START_GAME = "sendStartGame";
const SEND_PROCEED_TO_THE_NEXT_GAME = "sendProceedToTheNextGame";

//questions
const SEND_START_QUESTION = "sendStartQuestion";
const RETURN_ANSWER_QUESTION = "returnAnswerQuestion";
const SEND_PLAYER_ANSWERED_WRONGLY = "sendPlayerAnsweredWrongly";
const SEND_NO_ANSWER = "sendNoAnswer";
const SEND_NEW_PLAYER_SCORE = "sendNewPlayerScore";

// ---------------------------MMMM--------------------------------------
// -------------------------O-X--X-O--------------------------------------
// ---------------------------oooo----------------------------------------
// -------------------------/- ||--\-----------------------------------
// ------------------------""--||--""-----------------------------------

// PARTICIPANT
//tournament
const SEND_JOIN_TOURNAMENT = "sendJoinTournament";
const RETURN_JOIN_TOURNAMENT = "returnJoinTournament";

//games
const RETURN_START_GAME = "returnStartGame";
const RETURN_LOST_GAME = "returnLostGame";
const RETURN_WON_GAME = "returnWonGame";

//questions
const SEND_ANSWER_QUESTION = "sendAnswerQuestion";
const RETURN_ANSWER_QUESTION_BLOCKED = "returnAnswerQuestionBlocked";
const RETURN_NEW_PLAYER_SCORE = "returnNewPlayerScore";
const RETURN_PLAYER_CAN_ANSWER = "returnPlayerCanAnswer";
const RETURN_PLAYER_ANSWERED_WRONGLY = "returnPlayerAnsweredWrongly";
const RETURN_START_QUESTION = "returnStartQuestion";

// COMMON
const RETURN_START_TOURNAMENT = "returnStartTournament";

const PLAYERS_COUNT = 4;
const SINGLE_GAME_PLAYERS_COUNT = 2;

let tournaments: Record<string, Tournament> = {};
let currentGameId: string | null = null;
let currentGameIndex: number | null = null;
let hostSocket: Socket | null = null;
let playersSockets: Record<string, Socket> = {};

// Utils
const createGames = (players: Player[]): Record<string, Game> => {
  const gamesIds = new Array(PLAYERS_COUNT / SINGLE_GAME_PLAYERS_COUNT)
    .fill(0)
    .map((_, index) => `game${index + 1}`);

  const shuffledPlayers = shuffleArray(players);

  return Object.fromEntries(
    gamesIds.map((gameId, index) => [
      gameId,
      {
        gameId,
        isStarted: false,
        players: shuffledPlayers.slice(
          index * SINGLE_GAME_PLAYERS_COUNT,
          (index + 1) * SINGLE_GAME_PLAYERS_COUNT
        ),
      },
    ])
  );
};
const sendMessageToAllPlayers = (
  tournamentId: string,
  message: string,
  payload?: unknown
) => {
  Object.values(tournaments[tournamentId].players).forEach((player) =>
    playersSockets[player.id].emit(message, payload)
  );
};
const sendMessageToAllPlayersFromGame = (
  game: Game,
  message: string,
  payload?: unknown
) => {
  Object.values(game.players).forEach((player) =>
    playersSockets[player.id].emit(message, payload)
  );
};
const sendMessageToOtherPlayersFromGame = (
  playerToBeSkippedId: string,
  game: Game,
  message: string
) => {
  Object.values(game.players)
    .filter((player) => player.id !== playerToBeSkippedId)
    .forEach((player) => playersSockets[player.id].emit(message));
};

const onConnection = (socket: Socket) => {
  console.log("connected", socket.id);

  // HOST handlers
  socket.on(SEND_CREATE_TOURNAMENT, () => {
    const tournamentId = "Test";
    socket.emit(RETURN_NEW_TOURNAMENT, {
      tournamentId,
      playersCount: PLAYERS_COUNT,
    });
    hostSocket = socket;
    tournaments[tournamentId] = {
      players: [],
      games: {},
      finalPlayers: [],

      gamesCount: Math.floor(PLAYERS_COUNT / SINGLE_GAME_PLAYERS_COUNT),
      singleGamePlayersCount: SINGLE_GAME_PLAYERS_COUNT,
      isOpen: true,
      isStarted: false,
    };
    playersSockets = {};
  });
  socket.on(
    SEND_START_TOURNAMENT,
    ({ tournamentId }: { tournamentId: string }) => {
      console.log("Starting tournament ", tournamentId);
      const currentTournament = tournaments[tournamentId];
      if (!currentTournament) {
        console.error(SEND_START_TOURNAMENT, "NO TOURNAMENT", tournamentId);
      }
      currentTournament.isStarted = true;
      currentTournament.isOpen = false;
      currentTournament.games = createGames(currentTournament.players);
      currentGameIndex = 0;
      currentGameId = Object.keys(currentTournament.games)[currentGameIndex];
      if (!currentGameId) {
        console.error(SEND_START_TOURNAMENT, "NO GAME");
      }

      sendMsg(socket, RETURN_NEW_GAMES, currentTournament.games);
      sendMsg(socket, RETURN_CURRENT_GAME_ID, {
        currentGameId,
        currentGameIndex,
      });
      sendMsg(socket, RETURN_START_TOURNAMENT);
      sendMessageToAllPlayers(tournamentId, RETURN_START_TOURNAMENT);
    }
  );
  socket.on(
    SEND_START_GAME,
    ({ tournamentId, gameId }: { tournamentId: string; gameId: string }) => {
      console.log("Starting game ", gameId);
      const currentGame = tournaments[tournamentId].games[gameId];
      currentGame.isStarted = true;
      sendMsg(socket, RETURN_START_GAME);
      if (currentGame) {
        sendMessageToAllPlayersFromGame(currentGame, RETURN_START_GAME, {
          gameId,
        });
      } else {
        console.error("NO SUCH GAME", tournamentId, gameId);
      }
    }
  );
  socket.on(
    SEND_NEW_PLAYER_SCORE,
    ({
      answeringPlayerId,
      newScore,
    }: {
      answeringPlayerId: string;
      newScore: number;
    }) => {
      console.log("New score ", answeringPlayerId, " ", newScore);
      playersSockets[answeringPlayerId].emit(RETURN_NEW_PLAYER_SCORE, {
        newScore,
      });
    }
  );
  socket.on(
    SEND_START_QUESTION,
    ({ tournamentId, gameId }: { tournamentId: string; gameId: string }) => {
      const currentGame = tournaments[tournamentId].games[gameId];
      currentGame.players = currentGame.players.map((player) => ({
        ...player,
        wasAlreadyAnswering: false,
        isAnswering: false,
      }));

      sendMessageToAllPlayersFromGame(currentGame, RETURN_START_QUESTION);
    }
  );
  socket.on(
    SEND_PLAYER_ANSWERED_WRONGLY,
    ({ playerId, gameId, tournamentId }: ISendPlayerAnsweredWronglyPayload) => {
      console.log("PLAYER ANSWERED WRONGLY");
      const currentGame = tournaments[tournamentId].games[gameId];

      playersSockets[playerId].emit(RETURN_PLAYER_ANSWERED_WRONGLY);
      currentGame.players = currentGame.players.map((player) =>
        player.id === playerId
          ? { ...player, wasAlreadyAnswering: true }
          : player
      );
      currentGame.players
        .filter((player) => !player.wasAlreadyAnswering)
        .forEach((unansweredPlayer) =>
          playersSockets[unansweredPlayer.id].emit(RETURN_PLAYER_CAN_ANSWER)
        );
    }
  );
  socket.on(
    SEND_NO_ANSWER,
    ({ tournamentId, gameId }: { tournamentId: string; gameId: string }) => {
      const currentGame = tournaments[tournamentId].games[gameId];
      sendMessageToAllPlayersFromGame(
        currentGame,
        RETURN_ANSWER_QUESTION_BLOCKED
      );
    }
  );
  socket.on(
    SEND_PROCEED_TO_THE_NEXT_GAME,
    ({
      tournamentId,
      winnerId,
    }: {
      tournamentId: string;
      winnerId: string;
    }) => {
      if (!currentGameIndex) return;
      if (!currentGameId) return;

      const finishedGame = tournaments[tournamentId].games[currentGameId];

      currentGameIndex++;
      currentGameId = tournaments[tournamentId].games[currentGameIndex].gameId;
      const winnerSocket = playersSockets[winnerId];
      sendMsg(socket, RETURN_CURRENT_GAME_ID, {
        currentGameId,
        currentGameIndex,
      });
      sendMessageToOtherPlayersFromGame(
        winnerId,
        finishedGame,
        RETURN_LOST_GAME
      );
      sendMsg(winnerSocket, RETURN_WON_GAME);
    }
  );

  // PARTICIPANT handlers
  socket.on(
    SEND_JOIN_TOURNAMENT,
    ({
      tournamentId,
      playerName,
    }: {
      tournamentId: string;
      playerName: string;
    }) => {
      if (!hostSocket) return;

      if (tournaments[tournamentId] && tournaments[tournamentId].isOpen) {
        const tournamentPlayers = tournaments[tournamentId].players;
        tournamentPlayers.push({
          id: socket.id,
          score: 0,
          name: playerName,
          isAnswering: false,
          wasAlreadyAnswering: false,
        });
        playersSockets[socket.id] = socket;
        sendMsg(hostSocket, RETURN_NEW_PLAYERS, tournamentPlayers);
        sendMsg(socket, RETURN_JOIN_TOURNAMENT, true);
      } else {
        sendMsg(socket, RETURN_JOIN_TOURNAMENT, false);
      }
    }
  );
  socket.on(
    SEND_ANSWER_QUESTION,
    ({ tournamentId, gameId }: { tournamentId: string; gameId: string }) => {
      if (!hostSocket) {
        console.error("NO HOST");
        return;
      }
      const currentGame = tournaments[tournamentId].games[gameId];
      if (!currentGame) {
        console.error(SEND_ANSWER_QUESTION, "NO GAME", tournamentId, gameId);
      }

      sendMessageToAllPlayersFromGame(
        currentGame,
        RETURN_ANSWER_QUESTION_BLOCKED
      );
      sendMsg(hostSocket, RETURN_ANSWER_QUESTION, { playerId: socket.id });
    }
  );
};

io.on("connection", onConnection);
console.log("Listening on port: ", port);
httpServer.listen(port);
