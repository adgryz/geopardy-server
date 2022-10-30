import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import dotenv from "dotenv";

import { Game } from "./types";

dotenv.config();
const app = express();
const port = process.env.PORT;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let games: Record<string, Game> = {};
let showRunnerSocket: Socket | null = null;
let playerSockets: Record<string, Socket> = {};

const PLAYERS_COUNT = 3;

const onConnection = (socket: Socket) => {
  console.log("connected", socket.id);

  // SHOW-RUNNER handlers
  socket.on("sendCrateGame", () => {
    const gameId = "gra";
    socket.emit("returnNewGame", {
      gameId,
      playersCount: PLAYERS_COUNT,
    });
    showRunnerSocket = socket;
    games[gameId] = { isOpen: true, isStarted: false, players: [] };
    playerSockets = {};
  });
  socket.on("sendStartGame", (gameId: string) => {
    console.log("Starting game ", gameId);
    games[gameId] = { ...games[gameId], isStarted: true, isOpen: false };
  });
  socket.on(
    "sendNewPlayerScore",
    ({
      answeringPlayerId,
      newScore,
    }: {
      answeringPlayerId: string;
      newScore: number;
    }) => {
      console.log("New score ", answeringPlayerId, " ", newScore);
      playerSockets[answeringPlayerId].emit("returnNewPlayerScore", newScore);
    }
  );
  socket.on("sendStartQuestion", (gameId: string) => {
    console.log("STARTING QUESTION");

    games = {
      ...games,
      [gameId]: {
        ...games[gameId],
        players: games[gameId].players.map((player) => ({
          ...player,
          wasAlreadyAnswering: false,
          isAnswering: false,
        })),
      },
    };

    Object.values(playerSockets).forEach((playerSocket) =>
      playerSocket.emit("returnStartQuestion")
    );
  });
  socket.on(
    "sendPlayerAnsweredWrongly",
    ({ playerId, gameId }: { playerId: string; gameId: string }) => {
      console.log("PLAYER ANSWERED WRONGLY");
      playerSockets[playerId].emit("returnPlayerAnsweredWrongly");

      games = {
        ...games,
        [gameId]: {
          ...games[gameId],
          players: games[gameId].players.map((player) =>
            player.id === playerId
              ? { ...player, wasAlreadyAnswering: true }
              : player
          ),
        },
      };

      games[gameId].players
        .filter((player) => !player.wasAlreadyAnswering)
        .forEach((unansweredPlayer) =>
          playerSockets[unansweredPlayer.id].emit("returnPlayerCanAnswer")
        );
    }
  );
  socket.on("sendNoAnswer", (gameId: string) => {
    Object.values(playerSockets).forEach((playerSocket) =>
      playerSocket.emit("returnAnswerQuestionBlocked")
    );
  });

  // PARTICIPANT handlers
  socket.on(
    "sendJoinGame",
    ({ gameId, playerName }: { gameId: string; playerName: string }) => {
      console.log("games", games);
      if (!showRunnerSocket) return;

      if (games[gameId] && games[gameId].isOpen) {
        games = {
          ...games,
          [gameId]: {
            ...games[gameId],
            players: [
              ...games[gameId].players,
              {
                id: socket.id,
                score: 0,
                name: playerName,
                isAnswering: false,
                wasAlreadyAnswering: false,
              },
            ],
          },
        };
        playerSockets[socket.id] = socket;
        showRunnerSocket.emit("returnNewPlayers", games[gameId].players);
        socket.emit("returnJoinGame", true);

        if (Object.keys(games[gameId].players).length === PLAYERS_COUNT) {
          showRunnerSocket.emit("returnStartGame");
          // BUG 1 - Doesn't send it to last player if he is on mobile device
          // 1. playerSockets is missing last dude
          // 2. it gets emitted but participant doesnt get it
          // 3. participant got it but has bug on it's own (unlikely, because it works on other devices)
          Object.values(playerSockets).forEach((playerSocket) =>
            playerSocket.emit("returnStartGame")
          );
        }
      } else {
        socket.emit("returnJoinGame", false);
      }
    }
  );
  socket.on("sendAnswerQuestion", () => {
    if (!showRunnerSocket) return;
    const otherPlayersSockets = Object.values(playerSockets).filter(
      (playerSocket) => playerSocket.id !== socket.id
    );
    otherPlayersSockets.forEach((playerSocket) =>
      playerSocket.emit("returnAnswerQuestionBlocked")
    );

    console.log("returnAnswerQuestion");
    showRunnerSocket.emit("returnAnswerQuestion", socket.id);
  });
};

io.on("connection", onConnection);
console.log("Listening on port: ", port);
httpServer.listen(port);
