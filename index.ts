import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import dotenv from "dotenv";

import { Game } from "./types";

dotenv.config();
const app = express();
const port = 3003;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let games: Record<string, Game> = {};
let hostSocket: Socket | null = null;
let playerSockets: Record<string, Socket> = {};

const PLAYERS_COUNT = 3;

const onConnection = (socket: Socket) => {
  console.log("connected", socket.id);

  // HOST handlers
  socket.on("sendCrateGame", () => {
    const gameId = "Test";
    socket.emit("returnNewGame", {
      gameId,
      playersCount: PLAYERS_COUNT,
    });
    hostSocket = socket;
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
      if (!hostSocket) return;

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
        hostSocket.emit("returnNewPlayers", games[gameId].players);
        socket.emit("returnJoinGame", true);

        if (Object.keys(games[gameId].players).length === PLAYERS_COUNT) {
          hostSocket.emit("returnStartGame");
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
    if (!hostSocket) return;
    const otherPlayersSockets = Object.values(playerSockets).filter(
      (playerSocket) => playerSocket.id !== socket.id
    );
    otherPlayersSockets.forEach((playerSocket) =>
      playerSocket.emit("returnAnswerQuestionBlocked")
    );

    console.log("returnAnswerQuestion");
    hostSocket.emit("returnAnswerQuestion", socket.id);
  });
};

io.on("connection", onConnection);
console.log("Listening on port: ", port);
httpServer.listen(port);
