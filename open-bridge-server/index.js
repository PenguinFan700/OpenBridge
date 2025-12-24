const { Server } = require("socket.io");
const http = require("http");

// 建立 HTTP Server 封裝以提升在雲端平台（如 Render）的穩定性
const server = http.createServer();

// 設定端口：優先讀取環境變數 PORT，若無（本地開發）則使用 3001
const PORT = process.env.PORT || 3001;

const io = new Server(server, { 
    cors: { 
        origin: "*", // 部署初期建議先設為 *，確保能接收來自 Vercel 等前端的請求
        methods: ["GET", "POST"]
    } 
});

let rooms = {};
let bettingTimers = {}; // 確保每個房間的計時器獨立運作

// 1. 洗牌與發牌函式
function shuffleAndDeal() {
    const suits = ['S', 'H', 'D', 'C'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    let deck = [];
    suits.forEach(s => ranks.forEach(r => deck.push(s + '-' + r)));
    
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return {
        N: deck.slice(0, 13),
        E: deck.slice(13, 26),
        S: deck.slice(26, 39),
        W: deck.slice(39, 52)
    };
}

// 2. 判定一墩贏家的邏輯
function judgeWinner(playedCards, lastBid) {
    const trumpSuit = (lastBid === 'NT' || !lastBid || lastBid === 'Pass') ? null : lastBid[1];
    const leadSuit = playedCards[0].card[0]; 
    const rankOrder = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

    let winner = playedCards[0];
    for (let i = 1; i < playedCards.length; i++) {
        const current = playedCards[i];
        const winnerSuit = winner.card[0];
        const currentSuit = current.card[0];
        const winnerRank = winner.card.split('-')[1];
        const currentRank = current.card.split('-')[1];

        if (currentSuit === trumpSuit && winnerSuit !== trumpSuit) {
            winner = current;
        } else if (currentSuit === trumpSuit && winnerSuit === trumpSuit) {
            if (rankOrder.indexOf(currentRank) > rankOrder.indexOf(winnerRank)) winner = current;
        } else if (currentSuit === leadSuit && winnerSuit === leadSuit) {
            if (rankOrder.indexOf(currentRank) > rankOrder.indexOf(winnerRank)) winner = current;
        }
    }
    return winner.seat;
}

// 3. 賠率計算邏輯
function calculateDynamicOdds(handData) {
    const hcpTable = { 'A': 4, 'K': 3, 'Q': 2, 'J': 1, 'T': 0 };
    let totalHcp = 0;
    let suitCounts = { 'S': 0, 'H': 0, 'D': 0, 'C': 0 };

    Object.keys(handData).forEach(suit => {
        const cards = handData[suit];
        suitCounts[suit] = cards.length;
        cards.forEach(card => {
            const rank = card.split('-')[1];
            totalHcp += hcpTable[rank] || 0;
        });
    });

    let nsStrength = (totalHcp + 9) / 40.0;
    let nsWinProb = Math.max(0.1, Math.min(0.9, nsStrength));

    const levelWeights = { "1": 0.10, "2": 0.20, "3": 0.40, "4": 0.35, "5": 0.12 };
    const suits = ['C', 'D', 'H', 'S', 'NT'];
    const levels = ['1', '2', '3', '4', '5'];
    let matrix = {};

    suits.forEach(s => {
        matrix[s] = {};
        levels.forEach(lv => {
            let prob = levelWeights[lv];
            if (s === 'S' || s === 'H') prob *= 1.25;
            if (s !== 'NT' && suitCounts[s] >= 5) prob *= 1.4;
            if (s === 'NT' && totalHcp >= 12) prob *= 1.3;
            let finalProb = prob * (nsWinProb > 0.4 ? nsWinProb : (1 - nsWinProb));
            finalProb = Math.max(0.005, Math.min(0.9, finalProb));
            matrix[s][lv] = parseFloat((1 / finalProb).toFixed(2));
        });
    });

    return { totalHcp, nsWinProb, matrix };
}

// 4. Socket 通訊核心
io.on("connection", (socket) => {
    console.log("連線成功:", socket.id);

    socket.on("joinRoom", (roomId) => {
        socket.roomId = roomId;
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = {
                seats: { N: null, E: null, S: null, W: null },
                readyPlayers: { N: false, E: false, S: false, W: false },
                gameState: 'WAITING', 
                lastBid: null,
                bidHistory: [],
                currentTurn: null,
                playedCards: [],
                tricks: { N: 0, W: 0, S: 0, E: 0 },
                totalTricks: 0, 
                spectators: [],
                bets: {} 
            };
        }
        if (!rooms[roomId].spectators.includes(socket.id)) {
            rooms[roomId].spectators.push(socket.id);
        }
        io.to(roomId).emit("roomUpdate", rooms[roomId]);
    });

    socket.on("takeSeat", (seat) => {
        const room = rooms[socket.roomId];
        if (room && room.gameState === 'WAITING') {
            const alreadySeated = Object.values(room.seats).includes(socket.id);
            if (alreadySeated || room.seats[seat]) return;
            room.seats[seat] = socket.id;
            room.spectators = room.spectators.filter(id => id !== socket.id);
            io.to(socket.roomId).emit("roomUpdate", room);
        }
    });

    socket.on("leaveSeat", () => {
        const room = rooms[socket.roomId];
        if (room && room.gameState === 'WAITING') {
            const seat = Object.keys(room.seats).find(s => room.seats[s] === socket.id);
            if (seat) {
                room.seats[seat] = null;
                room.readyPlayers[seat] = false;
                if (!room.spectators.includes(socket.id)) room.spectators.push(socket.id);
                io.to(socket.id).emit("yourHand", []);
                io.to(socket.roomId).emit("roomUpdate", room);
            }
        }
    });

    socket.on("toggleReady", () => {
        const room = rooms[socket.roomId];
        if (room && room.gameState === 'WAITING') {
            const seat = Object.keys(room.seats).find(s => room.seats[s] === socket.id);
            if (seat) {
                room.readyPlayers[seat] = !room.readyPlayers[seat];
                io.to(socket.roomId).emit("roomUpdate", room);
            }
        }
    });

    socket.on("dealCards", () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (room && room.gameState === 'WAITING') {
        const allReady = Object.values(room.seats).every(s => s !== null) && 
                         Object.values(room.readyPlayers).every(v => v === true);
        if (!allReady) return;

        const hands = shuffleAndDeal();
        room.playerHands = hands;
        room.gameState = 'BETTING';
        room.bettingCountdown = 15;

        // 1. 發牌給座位上的玩家
        Object.keys(room.seats).forEach(seat => {
            const pid = room.seats[seat];
            if (pid) io.to(pid).emit("yourHand", hands[seat]);
        });

        // 2. 發牌給觀眾（包含預設邏輯）
        // 取得房內所有不在座位上的人
        const allClients = io.sockets.adapter.rooms.get(roomId);
        const seatedPlayers = Object.values(room.seats);

        allClients.forEach(socketId => {
            if (!seatedPlayers.includes(socketId)) {
                // 如果是觀眾，檢查是否有選位，沒選則預設看 N
                const betInfo = room.bets[socketId] || { targetSeat: 'N' };
                const chosenSeat = betInfo.targetSeat || 'N';
                const targetHand = hands[chosenSeat];

                // 修正：正確解析 S-2 格式的花色
                const formattedHand = { 'S':[], 'H':[], 'D':[], 'C':[] };
                targetHand.forEach(c => {
                    const suit = c.split('-')[0]; // 取出橫槓前的字元
                    if (formattedHand[suit]) formattedHand[suit].push(c);
                });

                const oddsResult = calculateDynamicOdds(formattedHand);
                
                // 定向推播
                io.to(socketId).emit("yourHand", targetHand);
                io.to(socketId).emit("oddsUpdate", oddsResult);
            }
        });

            if (bettingTimers[roomId]) clearInterval(bettingTimers[roomId]);
            
            bettingTimers[roomId] = setInterval(() => {
                room.bettingCountdown--;
                if (room.bettingCountdown <= 0) {
                    clearInterval(bettingTimers[roomId]);
                    delete bettingTimers[roomId]; // 清理計時器防止記憶體洩漏
                    room.gameState = 'BIDDING';
                    room.currentTurn = 'N';
                }
                io.to(roomId).emit("roomUpdate", room);
            }, 1000);
        }
    });

    socket.on("submitBid", (bid) => {
        const room = rooms[socket.roomId];
        if (!room || room.gameState !== 'BIDDING') return;
        const seat = Object.keys(room.seats).find(k => room.seats[k] === socket.id);
        if (seat !== room.currentTurn) return;

        room.bidHistory.push({ seat, bid });
        if (bid !== 'Pass') {
            room.lastBid = bid;
            room.declarer = seat;
        }

        const order = ['N', 'W', 'S', 'E'];
        room.currentTurn = order[(order.indexOf(seat) + 1) % 4];

        const history = room.bidHistory;
        if (history.length >= 4) {
            const lastThree = history.slice(-3);
            if (lastThree.every(b => b.bid === 'Pass') && room.lastBid) {
                room.gameState = 'PLAYING';
                const declarerIndex = order.indexOf(room.declarer);
                room.currentTurn = order[(declarerIndex + 1) % 4]; 
            } else if (history.length === 4 && lastThree.every(b => b.bid === 'Pass') && !room.lastBid) {
                room.gameState = 'WAITING';
                io.to(socket.roomId).emit("roomClosed", "流局，請重新準備。");
            }
        }
        io.to(socket.roomId).emit("roomUpdate", room);
    });

    socket.on("playCard", (card) => {
        const room = rooms[socket.roomId];
        if (!room || room.gameState !== 'PLAYING') return;
        const seat = Object.keys(room.seats).find(k => room.seats[k] === socket.id);
        if (seat !== room.currentTurn) return;

        room.playedCards.push({ seat, card });

        if (room.playedCards.length === 4) {
            const winnerSeat = judgeWinner(room.playedCards, room.lastBid);
            room.tricks[winnerSeat] += 1;
            room.totalTricks += 1; 
            io.to(socket.roomId).emit("roomUpdate", room);

            if (room.totalTricks === 13) {
                setTimeout(() => {
                    const level = parseInt(room.lastBid[0]);
                    const target = 6 + level;
                    const side = (room.declarer === 'N' || room.declarer === 'S') ? ['N', 'S'] : ['E', 'W'];
                    const sideTricks = room.tricks[side[0]] + room.tricks[side[1]];
                    const msg = sideTricks >= target ? `合約達成！(${sideTricks}墩)` : `合約失敗！(莊家僅得${sideTricks}墩)`;
                    
                    room.gameState = 'WAITING';
                    io.to(socket.roomId).emit("roomClosed", msg);
                    delete rooms[socket.roomId];
                }, 2000);
            } else {
                setTimeout(() => {
                    room.playedCards = [];
                    room.currentTurn = winnerSeat; 
                    io.to(socket.roomId).emit("roomUpdate", room);
                }, 1500);
            }
        } else {
            const order = ['N', 'W', 'S', 'E'];
            room.currentTurn = order[(order.indexOf(seat) + 1) % 4];
            io.to(socket.roomId).emit("roomUpdate", room);
        }
    });

    socket.on("disconnect", () => {
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            const seat = Object.keys(room.seats).find(s => room.seats[s] === socket.id);
            if (seat && room.gameState !== 'WAITING') {
                io.to(socket.roomId).emit("roomClosed", `玩家 ${seat} 已斷線，遊戲終止。`);
                if (bettingTimers[roomId]) {
                    clearInterval(bettingTimers[roomId]);
                    delete bettingTimers[roomId];
                }
                delete rooms[roomId];
            } else if (seat) {
                room.seats[seat] = null;
                room.readyPlayers[seat] = false;
                io.to(socket.roomId).emit("roomUpdate", room);
            }
            room.spectators = room.spectators.filter(id => id !== socket.id);
        }
    });
});

// 使用 server.listen 而非 io.listen 以確保雲端環境相容性
server.listen(PORT, () => {
    console.log(`✅ Bridge Server Running on port ${PORT}...`);
});
