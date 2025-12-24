import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { styles } from './styles.js';
import { sortHand } from './bridgeUtils.js';
import BiddingBox from './BiddingBox.jsx';

const positions = ['N', 'W', 'S', 'E'];
const socket = io('https://open-bridge-server.onrender.com');
// 計算調和平均數（綜合賠率）
const calculateCombinedOdds = (oddsArray) => {
  if (!oddsArray || oddsArray.length === 0) return 0;
  const sumOfReciprocals = oddsArray.reduce((acc, val) => acc + (1 / val), 0);
  return parseFloat((1 / sumOfReciprocals).toFixed(2));
};

function App() {
  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);
  const [room, setRoom] = useState({ 
    seats: { N: null, E: null, S: null, W: null }, 
    readyPlayers: {}, 
    gameState: 'WAITING', 
    tricks: { N: 0, W: 0, S: 0, E: 0 },
    lastBid: null, 
    currentTurn: null,
    playedCards: [], // 新增：桌面已出的牌
    bidHistory: []   // 新增：叫牌紀錄
  });
  const [hand, setHand] = useState([]);
  const [betData, setBetData] = useState({ type: 'view-one', targetSeat: 'N', prediction: '' });
  const [betLevel, setBetLevel] = useState(null); // 預測數字 (1-7)
  const [betSuit, setBetSuit] = useState(null);   // 預測花色 (S, H, D, C, NT)
  const [currentOdds, setCurrentOdds] = useState(null);
  // 當倒數計時結束時，或是玩家點擊按鈕時，自動同步給後端
  // 當下注選項改變時，自動同步給後端
  useEffect(() => {
  // 監聽房間更新
    socket.on("roomUpdate", (data) => setRoom(data));

    // 【關鍵】監聽發牌：觀眾也會收到這個事件
    socket.on("yourHand", (h) => {
      console.log("觀眾收到的手牌:", h); // 開啟 F12 檢查是否有印出這行
      setHand(sortHand(h));
    });

    socket.on("roomClosed", (msg) => {
      alert(msg);
      window.location.reload();
    });
    socket.on("oddsUpdate", (data) => setCurrentOdds(data));
    return () => {
      socket.off("roomUpdate");
      socket.off("yourHand");
      socket.off("roomClosed");
      socket.off("oddsUpdate");
    };
  }, []);
  useEffect(() => {
    // 只有在下注階段且「有選東西」時才發送
    if (room.gameState === 'BETTING' && (betLevel || betSuit)) {
      const prediction = `${betLevel || ''}${betSuit || ''}`;
      socket.emit('placeBet', { 
        targetSeat: betData.targetSeat, 
        prediction: prediction 
      });
    }
  }, [betLevel, betSuit, room.gameState, betData.targetSeat]); // 監聽這些值的變化
  const handleJoin = () => { if (roomId.trim()) { socket.emit("joinRoom", roomId); setJoined(true); } };
  const mySeat = Object.keys(room.seats).find(k => room.seats[k] === socket.id);
  const isSpectator = !mySeat; // 只要 mySeat 是 undefined，你就是觀眾
  const isMyTurn = room.currentTurn === mySeat;
  const allReady = room.seats.N && room.seats.E && room.seats.S && room.seats.W && 
                   room.readyPlayers.N && room.readyPlayers.E && room.readyPlayers.S && room.readyPlayers.W;

  const getSeatForDirection = (direction) => {
    // 1. 等待中或未入座，固定方位
    if (room.gameState === 'WAITING' || !mySeat) {
      const fixed = { TOP: 'N', BOTTOM: 'S', LEFT: 'W', RIGHT: 'E' }; // 這裡也要同步為逆時針視覺
      return fixed[direction];
    }

    // 2. 關鍵：這裡的 order 必須跟你的全域 positions 一致
    const order = ['N', 'W', 'S', 'E']; 
    const myIndex = order.indexOf(mySeat);
    
    let targetIndex;
    switch(direction) {
      case 'BOTTOM': 
        targetIndex = myIndex; 
        break;
      case 'RIGHT':  
        // 在 N-W-S-E 逆時針下，索引 +1 的人（W）會出現在你的右手邊
        targetIndex = (myIndex + 1) % 4; 
        break;
      case 'TOP':    
        targetIndex = (myIndex + 2) % 4; 
        break;
      case 'LEFT':   
        targetIndex = (myIndex + 3) % 4; 
        break;
      default: 
        targetIndex = myIndex;
    }
    return order[targetIndex];
  };

  // 處理出牌點擊
  const handlePlayCard = (card) => {
    if (room.gameState !== 'PLAYING' || !isMyTurn) return;

    // 取得這一墩的第一張牌（領先牌）
    const leadCard = room.playedCards && room.playedCards[0];

    if (leadCard) {
      const leadSuit = leadCard.card[0]; // 取得領先花色 (S, H, D, C)
      const mySuit = card[0];           // 取得我點擊的這張牌的花色

      // 檢查我手上是否還有「領先花色」
      const hasLeadSuit = hand.some(c => c[0] === leadSuit);

      // 如果我有領先花色，但出的牌卻不是該花色 -> 攔截！
      if (hasLeadSuit && mySuit !== leadSuit) {
        const suitNames = { 'S': '黑桃', 'H': '紅心', 'D': '方塊', 'C': '梅花' };
        alert(`必須跟出花色：${suitNames[leadSuit]}`);
        return; // 結束函式，不發送 socket 訊息
      }
    }

    // 通過檢查，或是身為領先出牌者，才送出指令
    socket.emit('playCard', card);
    setHand(prev => prev.filter(c => c !== card));
  };

  const Seat = ({ pos, label }) => {
    const sid = room.seats[pos];
    const isReady = room.readyPlayers[pos];
    const isMe = sid === socket.id;
    const tricksCount = (room.tricks && room.tricks[pos]) || 0;

    return (
      <div style={{ ...styles.seatBox, minWidth: '140px' }}>
        <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '18px' }}>{label} ({pos})</div>
        
        {!sid ? (
          // 只有觀眾才能入座
          isSpectator && room.gameState === 'WAITING' ? (
            <button 
              style={{ ...styles.btnAction, fontSize: '16px', padding: '8px 20px', backgroundColor: '#3498db' }} 
              onClick={() => socket.emit('takeSeat', pos)}
            >
              入座
            </button>
          ) : (
            <div style={{ color: '#888', fontSize: '14px' }}>空位</div>
          )
        ) : (
          <div>
            {room.gameState === 'PLAYING' && (
              <div style={{ 
                backgroundColor: '#2c3e50', color: '#fff', padding: '4px 12px', 
                borderRadius: '10px', fontSize: '16px', marginBottom: '8px', border: '1px solid #f1c40f' 
              }}>
                墩數: {tricksCount}
              </div>
            )}
            
            <div style={{ color: isReady ? '#4caf50' : '#ff9800', marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>
              {isReady ? "● 已準備" : "○ 未準備"}
            </div>
            
            {isMe && room.gameState === 'WAITING' && (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button 
                  style={{ 
                    ...styles.btnSmall, fontSize: '14px', padding: '6px 15px',
                    backgroundColor: isReady ? '#e67e22' : '#4caf50', color: 'white', border: 'none'
                  }} 
                  onClick={() => socket.emit('toggleReady')}
                >
                  {isReady ? "取消" : "準備"}
                </button>
                <button 
                  style={{ 
                    ...styles.btnSmall, fontSize: '14px', padding: '6px 15px',
                    backgroundColor: '#e74c3c', color: 'white', border: 'none', cursor: 'pointer'
                  }} 
                  onClick={() => socket.emit('leaveSeat')}
                >
                  起身
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!joined) return (
    <div style={styles.lobby}>
      <h1>Bridge Online</h1>
      <input autoFocus value={roomId} onChange={e => setRoomId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleJoin()} placeholder="房號" />
      <button onClick={handleJoin} style={{ marginTop: '10px', padding: '10px 30px' }}>進入房間</button>
    </div>
  );

  return (
    <div style={styles.table}>
      {/* 叫牌紀錄側邊欄 */}
      <div style={{ position: 'absolute', left: 20, top: 20, background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px', color: 'white', maxHeight: '200px', overflowY: 'auto' }}>
        <div style={{ fontWeight: 'bold', borderBottom: '1px solid white', marginBottom: '5px' }}>叫牌紀錄</div>
        {room.bidHistory.map((b, i) => (
          <div key={i} style={{ fontSize: '12px' }}>{b.seat}: {b.bid}</div>
        ))}
      </div>

      <div style={{ gridColumn: '2', gridRow: '1', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
        <Seat pos={getSeatForDirection('TOP')} label={room.gameState === 'WAITING' ? "North" : "Partner"} />
      </div>

      <div style={{ gridColumn: '1', gridRow: '2', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <Seat pos={getSeatForDirection('LEFT')} label={room.gameState === 'WAITING' ? "West" : "LHO"} />
      </div>

      {/* 中央區域 */}
      <div style={{ gridColumn: '2', gridRow: '2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ffffff55', margin: '40px', borderRadius: '15px', position: 'relative' }}>
        <h2 style={{ marginBottom: '15px' }}>房號: {roomId}</h2>
        
        {/* A. 等待階段：任何玩家點擊發牌 */}
        {room.gameState === 'WAITING' && (
          <>
            {!isSpectator ? (
              <button 
                disabled={!allReady} 
                onClick={() => socket.emit('dealCards')} 
                style={{ ...styles.btnCenter, backgroundColor: allReady ? '#4caf50' : '#444', color: 'white' }}
              >
                {allReady ? "確認人數並發牌" : "等待全員準備..."}
              </button>
            ) : (
              <div style={{ color: '#aaa', fontSize: '18px' }}>等待玩家開始遊戲...</div>
            )}
            <button onClick={() => window.location.reload()} style={{ ...styles.btnCenter, backgroundColor: '#d32f2f', color: 'white', marginTop: '10px' }}>離開房間</button>
          </>
        )}

        {/* B. 下注倒數階段 (新增) */}
        {room.gameState === 'BETTING' && (
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ color: '#f1c40f', fontSize: '24px' }}>觀眾下注中...</h3>
            <div style={{ 
              fontSize: '48px', 
              fontWeight: 'bold', 
              color: room.bettingCountdown <= 5 ? '#e74c3c' : '#2ecc71' 
            }}>
              {room.bettingCountdown}s
            </div>
          </div>
        )}

        {/* C. 叫牌階段 (保留你原本的 BiddingBox 邏輯) */}
        {room.gameState === 'BIDDING' && (
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ color: isMyTurn ? '#00ff00' : '#ffeb3b' }}>
              {isMyTurn ? "★ 輪到你叫牌" : `等待 ${room.currentTurn} 叫牌...`}
            </h3>
            <div style={{ margin: '8px 0' }}>合約: {room.lastBid || '無'}</div>
            {isMyTurn && (
              <BiddingBox 
                lastBid={room.lastBid} 
                onBid={(bid) => socket.emit('submitBid', bid)} 
              />
            )}
          </div>
        )}

        {/* D. 打牌階段 (完全保留你原本精確的 getPositionStyle 邏輯) */}
        {room.gameState === 'PLAYING' && (
          <div style={{ width: '250px', height: '200px', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <h4 style={{ position: 'absolute', top: -50, width: '100%', textAlign: 'center', color: isMyTurn ? '#00ff00' : 'white' }}>
              {isMyTurn ? "★ 輪到你出牌" : `等待 ${room.currentTurn} ...`}
            </h4>
            {room.playedCards && room.playedCards.map((p, i) => {
              const getDirectionForSeat = (seat) => {
                if (seat === getSeatForDirection('BOTTOM')) return 'BOTTOM';
                if (seat === getSeatForDirection('TOP')) return 'TOP';
                if (seat === getSeatForDirection('LEFT')) return 'LEFT';
                if (seat === getSeatForDirection('RIGHT')) return 'RIGHT';
                return 'BOTTOM';
              };
              const dir = getDirectionForSeat(p.seat);
              const getPositionStyle = (direction) => {
                switch(direction) {
                  case 'BOTTOM': return { bottom: '10px', left: '50%', transform: 'translateX(-50%)' };
                  case 'TOP':    return { top: '10px', left: '50%', transform: 'translateX(-50%)' };
                  case 'LEFT':   return { left: '10px', top: '50%', transform: 'translateY(-50%)' };
                  case 'RIGHT':  return { right: '10px', top: '50%', transform: 'translateY(-50%)' };
                  default: return {};
                }
              };
              return (
                <div key={i} style={{
                  ...styles.card,
                  position: 'absolute',
                  zIndex: i,
                  ...getPositionStyle(dir),
                  color: (p.card[0]==='H'||p.card[0]==='D') ? 'red' : 'black',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                  border: '2px solid white'
                }}>
                  {p.card.replace('-','')}
                </div>
              );
            })}
          </div>
        )}
      </div>


      <div style={{ gridColumn: '3', gridRow: '2', display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
        <Seat pos={getSeatForDirection('RIGHT')} label={room.gameState === 'WAITING' ? "East" : "RHO"} />
      </div>

      <div style={{ gridColumn: '2', gridRow: '3', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Seat pos={getSeatForDirection('BOTTOM')} label={room.gameState === 'WAITING' ? "South" : "Me"} />
        <div style={{ marginTop: '15px', display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {hand.map(c => (
            <div key={c} 
              onClick={() => handlePlayCard(c)}
              style={{
                ...styles.card, 
                color: (c[0]==='H'||c[0]==='D')?'red':'black',
                cursor: (room.gameState === 'PLAYING' && isMyTurn) ? 'pointer' : 'default',
                transform: (room.gameState === 'PLAYING' && isMyTurn) ? 'translateY(-10px)' : 'none',
                transition: 'transform 0.2s',
                boxShadow: (room.gameState === 'PLAYING' && isMyTurn) ? '0 0 10px gold' : 'none'
              }}>
              {c.replace('-','')}
            </div>
          ))}
        </div>
      </div>

      {/* 觀眾預測區：整合方位選擇與預覽 */}
      <div style={{ ...styles.specArea, padding: '15px' }}>
        <div style={{ 
          ...styles.seatBox, border: '2px solid #f1c40f', minWidth: '280px',
          backgroundColor: 'rgba(20, 20, 20, 0.95)', borderRadius: '15px'
        }}>
          <strong style={{ fontSize: '18px', color: '#f1c40f', display: 'block', marginBottom: '10px' }}>觀眾預測區</strong>
          
          {!mySeat ? (
            <div>
              {/* A. WAITING 階段：顯示方位選單 (修正重點) */}
              {room.gameState === 'WAITING' && (
                <div style={{ padding: '10px 0', textAlign: 'center' }}>
                  <label style={{ color: 'white', fontSize: '15px', display: 'block', marginBottom: '10px' }}>
                    發牌後想看：
                  </label>
                  <select 
                    style={{ 
                      fontSize: '16px', padding: '6px 12px', borderRadius: '6px', 
                      backgroundColor: '#333', color: 'white', border: '1px solid #f1c40f',
                      cursor: 'pointer', width: '80%'
                    }}
                    value={betData.targetSeat || 'N'} 
                    onChange={e => {
                      const newSeat = e.target.value;
                      const newBet = { ...betData, targetSeat: newSeat };
                      setBetData(newBet);
                      socket.emit('placeBet', newBet);
                    }}
                  >
                    <option value="N">北方 (North)</option>
                    <option value="E">東方 (East)</option>
                    <option value="S">南方 (South)</option>
                    <option value="W">西方 (West)</option>
                  </select>
                </div>
              )}

              {/* B. 遊戲開始後 (BETTING, BIDDING, PLAYING) */}
              {room.gameState !== 'WAITING' && (
                <div>
                  <div style={{ color: '#2ecc71', fontSize: '12px', marginBottom: '12px' }}>
                    正在查看 {betData.targetSeat} 方手牌 | HCP: {currentOdds?.totalHcp || 0}
                  </div>

                  {room.gameState === 'BETTING' && (
                    <>
                      {/* 數字與 C 按鈕區 */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' }}>
                        {[1, 2, 3, 4, 5, 6, 7].map(num => (
                          <button 
                            key={num} onClick={() => setBetLevel(num)}
                            style={{
                              padding: '12px 0', borderRadius: '8px', border: '1px solid #f1c40f',
                              backgroundColor: betLevel === num ? '#f1c40f' : 'transparent',
                              color: betLevel === num ? '#000' : '#f1c40f', cursor: 'pointer', fontWeight: 'bold'
                            }}
                          >{num}</button>
                        ))}
                        <button 
                          onClick={() => { setBetLevel(null); setBetSuit(null); }}
                          style={{
                            padding: '12px 0', borderRadius: '8px', border: '1px solid #e74c3c',
                            backgroundColor: 'transparent', color: '#e74c3c', cursor: 'pointer', fontWeight: 'bold'
                          }}
                        >C</button>
                      </div>

                      {/* 花色按鈕區 */}
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '15px' }}>
                        {['S', 'H', 'D', 'C', 'NT'].map(suit => (
                          <button 
                            key={suit} onClick={() => setBetSuit(suit)}
                            style={{
                              width: '42px', height: '42px', borderRadius: '50%', 
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: '1px solid #f1c40f',
                              backgroundColor: betSuit === suit ? '#f1c40f' : 'rgba(255,255,255,0.05)',
                              color: betSuit === suit ? '#000' : (suit === 'H' || suit === 'D' ? '#ff4d4d' : '#fff'), 
                              cursor: 'pointer', fontWeight: 'bold', fontSize: '18px', padding: 0
                            }}
                          >
                            {suit === 'S' && '♠'} {suit === 'H' && '♥'} {suit === 'D' && '♦'} {suit === 'C' && '♣'} {suit === 'NT' && 'NT'}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {/* 預覽區 (持續顯示) */}
                  <div style={{ 
                    marginTop: '10px', padding: '15px', background: 'rgba(255,255,255,0.08)', 
                    borderRadius: '10px', border: '1px solid #444', textAlign: 'center' 
                  }}>
                    <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>組合預測賠率預覽</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' }}>
                      <span style={{ fontSize: '24px', color: '#f1c40f', fontWeight: 'bold' }}>
                        {betLevel || '?'}{betSuit === 'S' && '♠'}{betSuit === 'H' && '♥'}{betSuit === 'D' && '♦'}{betSuit === 'C' && '♣'}{betSuit === 'NT' && 'NT'}{!betSuit && '?'}
                      </span>
                      <span style={{ fontSize: '20px', color: '#2ecc71', fontWeight: 'bold' }}>
                        x {(() => {
                          if (!currentOdds) return "---";
                          if (betLevel && betSuit) return currentOdds.matrix[betSuit][betLevel > 5 ? '5' : betLevel.toString()] || "1.00";
                          if (betLevel) return calculateCombinedOdds(['S','H','D','C','NT'].map(s => currentOdds.matrix[s][betLevel > 5 ? '5' : betLevel.toString()]));
                          if (betSuit) return calculateCombinedOdds(Object.values(currentOdds.matrix[betSuit]));
                          return "1.00";
                        })()}
                      </span>
                    </div>
                    {room.gameState !== 'BETTING' && <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>預測已鎖定</div>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#888', padding: '10px 0' }}>★ 玩家席 ({mySeat})</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
