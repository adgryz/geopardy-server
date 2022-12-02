import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import dotenv from "dotenv";

import { Game, Player, Tournament } from "./types";
import { shuffleArray } from "./shuffleArray";
import { ISendPlayerAnsweredWronglyPayload } from "./messagesTypes";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
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

//final_game
const RETURN_UPDATED_FINAL_GAME = "returnUpdatedFinalGame";
const RETURN_NEXT_GAME_IS_FINAL = "returnNextGameIsFinal";

//questions
const SEND_START_QUESTION = "sendStartQuestion";
const RETURN_ANSWER_QUESTION = "returnAnswerQuestion";
const SEND_PLAYER_ANSWERED_WRONGLY = "sendPlayerAnsweredWrongly";
const SEND_NO_ANSWER = "sendNoAnswer";
const SEND_NEW_PLAYER_SCORE = "sendNewPlayerScore";

//final question
const SEND_START_FINAL_QUESTION = "sendStartFinalQuestion";
const RETURN_ALL_BETS_SENT = "returnAllBetsSent";
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

//games
const RETURN_START_GAME = "returnStartGame";
const RETURN_LOST_GAME = "returnLostGame";
const RETURN_WON_GAME = "returnWonGame";

//final_game
const RETURN_START_FINAL_GAME = "returnStartFinalGame";
const RETURN_WON_FINAL_GAME = "returnWonFinalGame";

//questions
const SEND_ANSWER_QUESTION = "sendAnswerQuestion";
const RETURN_ANSWER_QUESTION_BLOCKED = "returnAnswerQuestionBlocked";
const RETURN_NEW_PLAYER_SCORE = "returnNewPlayerScore";
const RETURN_PLAYER_CAN_ANSWER = "returnPlayerCanAnswer";
const RETURN_PLAYER_ANSWERED_WRONGLY = "returnPlayerAnsweredWrongly";
const RETURN_START_QUESTION = "returnStartQuestion";

//final question
const RETURN_START_FINAL_QUESTION = "returnStartFinalQuestion";
const SEND_BET_AMOUNT = "sendBetAmount";
const RETURN_FINAL_QUESTION = "returnFinalQuestion";
const SEND_FINAL_QUESTION_ANSWER = "sendFinalQuestionAnswer";
const RETURN_RUN_OUT_OF_TIME = "returnRunOutOfTime";
const RETURN_IS_FINAL_QUESTION_ANSWER_CORRECT =
  "returnIsFinalQuestionAnswerCorrect";

// COMMON
const RETURN_START_TOURNAMENT = "returnStartTournament";

const PLAYERS_COUNT = 9;
const SINGLE_GAME_PLAYERS_COUNT = 3;
const GAMES_CONT = Math.floor(PLAYERS_COUNT / SINGLE_GAME_PLAYERS_COUNT);

let tournaments: Record<string, Tournament> = {};
let currentGameId: string | null = null;
let currentGameIndex: number | null = null;
let hostSocket: Socket | null = null;
let playersSockets: Record<string, Socket> = {};
let isFinalGame = false;

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
        finalQuestionInfos: {},
      },
    ])
  );
};
const getCurrentGame = ({
  tournamentId,
  gameId,
}: {
  tournamentId: string;
  gameId: string;
}): Game => {
  return isFinalGame
    ? tournaments[tournamentId].finalGame
    : tournaments[tournamentId].games[gameId];
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

  // *****************************************************************
  // HOST handlers
  // *****************************************************************

  // TOURNAMENT
  //---------------------------------------------
  // SEND_CREATE_TOURNAMENT
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
      finalGame: {
        gameId: "finalGame",
        isStarted: false,
        players: [],
        finalQuestionInfos: {},
      },

      gamesCount: GAMES_CONT,
      singleGamePlayersCount: SINGLE_GAME_PLAYERS_COUNT,
      isOpen: true,
      isStarted: false,
    };
    playersSockets = {};
    currentGameId = null;
    currentGameIndex = null;
    isFinalGame = false;
  });
  // SEND_START_TOURNAMENT
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

  // GAMES
  //---------------------------------------------
  // SEND_START_GAME
  socket.on(
    SEND_START_GAME,
    ({ tournamentId, gameId }: { tournamentId: string; gameId: string }) => {
      console.log("Starting game ", gameId);
      console.log("Is final game ", isFinalGame);
      const currentGame = getCurrentGame({ tournamentId, gameId });
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
  // SEND_PROCEED_TO_THE_NEXT_GAME
  socket.on(
    SEND_PROCEED_TO_THE_NEXT_GAME,
    ({
      tournamentId,
      winnerId,
    }: {
      tournamentId: string;
      winnerId: string;
    }) => {
      console.log(
        SEND_PROCEED_TO_THE_NEXT_GAME,
        currentGameIndex,
        currentGameId
      );
      if (currentGameIndex === null) return;
      if (!currentGameId) return;

      const currentTournament = tournaments[tournamentId];
      const finishedGame = currentTournament.games[currentGameId];

      // Add winner to final game
      addWinnerToFinal(currentTournament, finishedGame, winnerId);

      const isLastGameFinished = currentGameIndex === GAMES_CONT - 1;
      if (isLastGameFinished) {
        handleFinalGameStart(currentTournament);
      } else {
        handleNextQualifyGameStart(currentTournament);
      }

      console.log("inform");
      informParticipantAboutGameResults(
        winnerId,
        currentTournament,
        finishedGame
      );

      if (isLastGameFinished) {
        isFinalGame = true;
      }
    }
  );
  const addWinnerToFinal = (
    currentTournament: Tournament,
    finishedGame: Game,
    winnerId: string
  ) => {
    const winner = finishedGame.players.find(
      (player) => player.id === winnerId
    );
    if (!winner) {
      return;
    }
    currentTournament.finalGame.players.push({
      name: winner.name,
      score: 0,
      isAnswering: false,
      id: winnerId,
    });
    sendMsg(socket, RETURN_UPDATED_FINAL_GAME, {
      finalGame: currentTournament.finalGame,
    });
  };
  const handleFinalGameStart = (currentTournament: Tournament) => {
    sendMsg(socket, RETURN_NEXT_GAME_IS_FINAL);
    currentTournament.finalGame.players.forEach((finalPlayer) => {
      console.log(
        "handleFinalGameStart",
        RETURN_START_FINAL_GAME,
        finalPlayer.id
      );
      playersSockets[finalPlayer.id].emit(RETURN_START_FINAL_GAME, {
        gameId: currentTournament.finalGame.gameId,
      });
    });
  };
  const handleNextQualifyGameStart = (currentTournament: Tournament) => {
    if (currentGameIndex === null) {
      return;
    }
    currentGameIndex++;
    currentGameId = Object.values(currentTournament.games)[currentGameIndex]
      .gameId;
    sendMsg(socket, RETURN_CURRENT_GAME_ID, {
      currentGameId,
      currentGameIndex,
    });
  };
  const informParticipantAboutGameResults = (
    winnerId: string,
    currentTournament: Tournament,
    finishedGame: Game
  ) => {
    const winnerSocket = playersSockets[winnerId];

    console.log("informParticipantAboutGameResults", winnerId, isFinalGame);
    if (!winnerSocket) {
      console.error("NO WINNER SOCKET", winnerId);
    }
    sendMsg(
      winnerSocket,
      isFinalGame ? RETURN_WON_FINAL_GAME : RETURN_WON_GAME
    );
    sendMessageToOtherPlayersFromGame(winnerId, finishedGame, RETURN_LOST_GAME);
    sendMsg(socket, RETURN_NEW_GAMES, currentTournament.games);
  };

  // QUESTIONS
  //---------------------------------------------
  // SEND_START_QUESTION
  socket.on(
    SEND_START_QUESTION,
    ({ tournamentId, gameId }: { tournamentId: string; gameId: string }) => {
      const currentGame = getCurrentGame({ tournamentId, gameId });
      currentGame.players = currentGame.players.map((player) => ({
        ...player,
        wasAlreadyAnswering: false,
        isAnswering: false,
      }));

      sendMessageToAllPlayersFromGame(currentGame, RETURN_START_QUESTION);
    }
  );
  // SEND_PLAYER_ANSWERED_WRONGLY
  socket.on(
    SEND_PLAYER_ANSWERED_WRONGLY,
    ({ playerId, gameId, tournamentId }: ISendPlayerAnsweredWronglyPayload) => {
      console.log("PLAYER ANSWERED WRONGLY");
      const currentGame = getCurrentGame({ tournamentId, gameId });

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
  // SEND_NEW_PLAYER_SCORE
  socket.on(
    SEND_NEW_PLAYER_SCORE,
    ({
      tournamentId,
      gameId,
      answeringPlayerId,
      newScore,
    }: {
      tournamentId: string;
      gameId: string;
      answeringPlayerId: string;
      newScore: number;
    }) => {
      if (!answeringPlayerId) {
        console.error("NO ANSWERING PLAYER ID");
        return;
      }
      console.log("New score ", answeringPlayerId, " ", newScore);
      const currentGame = getCurrentGame({ tournamentId, gameId });
      currentGame.players = currentGame.players.map((player) =>
        player.id === answeringPlayerId
          ? { ...player, score: newScore }
          : player
      );

      playersSockets[answeringPlayerId].emit(RETURN_NEW_PLAYER_SCORE, {
        newScore,
      });
    }
  );
  // SEND_NO_ANSWER
  socket.on(
    SEND_NO_ANSWER,
    ({ tournamentId, gameId }: { tournamentId: string; gameId: string }) => {
      const currentGame = getCurrentGame({ tournamentId, gameId });
      sendMessageToAllPlayersFromGame(
        currentGame,
        RETURN_ANSWER_QUESTION_BLOCKED
      );
    }
  );

  // FINAL QUESTION
  //---------------------------------------------
  // SEND_START_FINAL_QUESTION
  socket.on(
    SEND_START_FINAL_QUESTION,
    ({ gameId, tournamentId }: { tournamentId: string; gameId: string }) => {
      const currentGame = getCurrentGame({ tournamentId, gameId });
      currentGame.isFinalQuestionStarted = true;
      sendMessageToAllPlayersFromGame(currentGame, RETURN_START_FINAL_QUESTION);
    }
  );
  // SEND_SHOW_FINAL_QUESTION
  socket.on(
    SEND_SHOW_FINAL_QUESTION,
    ({ gameId, tournamentId }: { tournamentId: string; gameId: string }) => {
      const currentGame = getCurrentGame({ tournamentId, gameId });
      sendMessageToAllPlayersFromGame(currentGame, RETURN_FINAL_QUESTION);
    }
  );
  // SEND_FINAL_QUESTION_TIME_OUT
  socket.on(
    SEND_FINAL_QUESTION_TIME_OUT,
    ({ gameId, tournamentId }: { tournamentId: string; gameId: string }) => {
      const currentGame = getCurrentGame({ tournamentId, gameId });
      currentGame.isFinalQuestionStarted = false;
      sendMessageToAllPlayersFromGame(currentGame, RETURN_RUN_OUT_OF_TIME);
      sendMsg(socket, RETURN_FINAL_QUESTION_ANSWERS, {
        finalQuestionInfos: currentGame.finalQuestionInfos,
      });
    }
  );
  // SEND_CORRECT_FINAL_ANSWER
  socket.on(
    SEND_CORRECT_FINAL_ANSWER,
    ({
      gameId,
      tournamentId,
      playerId,
    }: {
      tournamentId: string;
      gameId: string;
      playerId: string;
    }) => {
      const currentGame = getCurrentGame({ tournamentId, gameId });
      const playerBet = currentGame.finalQuestionInfos[playerId].betAmount;
      currentGame.players = currentGame.players.map((player) =>
        player.id === playerId
          ? { ...player, score: player.score + playerBet }
          : player
      );
      const newScore =
        currentGame.players.find((player) => player.id === playerId)?.score ||
        0;
      sendMsg(
        playersSockets[playerId],
        RETURN_IS_FINAL_QUESTION_ANSWER_CORRECT,
        { isCorrect: true, newScore }
      );
    }
  );
  // SEND_INCORRECT_FINAL_ANSWER
  socket.on(
    SEND_INCORRECT_FINAL_ANSWER,
    ({
      gameId,
      tournamentId,
      playerId,
    }: {
      tournamentId: string;
      gameId: string;
      playerId: string;
    }) => {
      const currentGame = getCurrentGame({ tournamentId, gameId });
      const playerBet = currentGame.finalQuestionInfos[playerId].betAmount;
      currentGame.players = currentGame.players.map((player) =>
        player.id === playerId
          ? { ...player, score: player.score - playerBet }
          : player
      );
      const newScore =
        currentGame.players.find((player) => player.id === playerId)?.score ||
        0;
      sendMsg(
        playersSockets[playerId],
        RETURN_IS_FINAL_QUESTION_ANSWER_CORRECT,
        { isCorrect: false, newScore }
      );
    }
  );

  // *****************************************************************
  // PARTICIPANT handlers
  // *****************************************************************

  // TOURNAMENT
  //---------------------------------------------
  // SEND_JOIN_TOURNAMENT,
  socket.on(
    SEND_JOIN_TOURNAMENT,
    ({
      tournamentId,
      playerName,
      base64Photo,
    }: {
      tournamentId: string;
      playerName: string;
      base64Photo: string;
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
          base64Photo,
        });
        playersSockets[socket.id] = socket;
        sendMsg(hostSocket, RETURN_NEW_PLAYERS, tournamentPlayers);
        sendMsg(socket, RETURN_JOIN_TOURNAMENT, true);
      } else {
        sendMsg(socket, RETURN_JOIN_TOURNAMENT, false);
      }
    }
  );

  // QUESTION
  //---------------------------------------------
  // SEND_ANSWER_QUESTION,
  socket.on(
    SEND_ANSWER_QUESTION,
    ({ tournamentId, gameId }: { tournamentId: string; gameId: string }) => {
      if (!hostSocket) {
        console.error("NO HOST");
        return;
      }
      const currentGame = getCurrentGame({ tournamentId, gameId });
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

  // FINAL QUESTION
  //---------------------------------------------
  // SEND_BET_AMOUNT
  socket.on(
    SEND_BET_AMOUNT,
    ({
      tournamentId,
      gameId,
      betAmount,
    }: {
      tournamentId: string;
      gameId: string;
      betAmount: number;
    }) => {
      const currentGame = getCurrentGame({ tournamentId, gameId });
      currentGame.finalQuestionInfos[socket.id] = {
        playerId: socket.id,
        betAmount: betAmount,
        answer: "",
      };

      const allPlayersSubmittedTheirBets =
        Object.values(currentGame.finalQuestionInfos).length ===
        SINGLE_GAME_PLAYERS_COUNT;
      console.log();
      if (allPlayersSubmittedTheirBets && hostSocket) {
        sendMsg(hostSocket, RETURN_ALL_BETS_SENT);
      }
    }
  );
  // SEND_FINAL_QUESTION_ANSWER
  socket.on(
    SEND_FINAL_QUESTION_ANSWER,
    ({
      tournamentId,
      gameId,
      answer,
    }: {
      tournamentId: string;
      gameId: string;
      answer: string;
    }) => {
      const currentGame = getCurrentGame({ tournamentId, gameId });
      currentGame.finalQuestionInfos[socket.id].answer = answer;
    }
  );
};

io.on("connection", onConnection);
console.log("IM ALIVE");
console.log("Listening on port: ", port);
httpServer.listen(port);
