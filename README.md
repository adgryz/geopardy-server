# geopardy-server

git push heroku to deploy

FLOW GRY
1. Host creates tournament
2. 9 players join the tournament
3. server creates 3 games and final game - it assigns players and questions per game
4. tournament starts - display TournamentPage - with groups

// Three times
5. Game is started - 3players have BuzzerPage, rest has WaitForYourGamePage/YouLostPage/WaitForFinalPage
6. Single game flow -  goes on until there is a winner
7. Game finished - updated TournamentPage is displayed

8. Final game between 3 players
9. Final view with the winner


FLOW FINAL QUESTION
2nd round end 
=> navigate to final question view / navigate to final question view
=> show category / show betting inputs and button to confirm
All players done bets
=> click to show question / show input for answer
30 s for answer
=> show players answers


TODOS:
2) Dodaj logikę finalnego pytania
3) Dodaj logikę podwójnej premii
4) Zrób ładne lobby
5) Zrób ładne przyciski
6) Dodaj moliwość wrzucenia foteczki