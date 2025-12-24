import React, { useState } from 'react';
import { isLegalBid } from './bridgeUtils';

const BiddingBox = ({ lastBid, onBid }) => {
  const [selected, setSelected] = useState(null);
  const levels = [1, 2, 3, 4, 5, 6, 7];
  const suits = ['C', 'D', 'H', 'S', 'NT'];

  // 處理送出叫牌
  const handleConfirm = () => {
    if (selected) {
      onBid(selected); // 這裡會傳送 '1H', '2C' 或 'Pass'
      setSelected(null);
    }
  };

  return (
    <div style={{ background: 'white', padding: '15px', borderRadius: '12px', width: '320px', boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }}>
      {/* 叫牌按鈕區 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '5px' }}>
        {levels.map(l => suits.map(s => {
          const b = `${l}${s}`, legal = isLegalBid(lastBid, b);
          return (
            <button 
              key={b} 
              disabled={!legal} 
              onClick={() => setSelected(b)}
              style={{ 
                padding: '8px 0', 
                fontSize: '13px', 
                fontWeight: 'bold', 
                borderRadius: '4px',
                border: '1px solid #ddd',
                backgroundColor: selected === b ? '#ffc107' : (legal ? '#fff' : '#f5f5f5'), 
                color: legal ? '#333' : '#bbb',
                cursor: legal ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s'
              }}
            >
              {b}
            </button>
          );
        }))}
      </div>

      {/* 功能按鈕區 */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
        {/* PASS 按鈕：建議改成點擊兩次或直接送出 */}
        <button 
          onClick={() => {
            // 這裡建議直接送出 'Pass'，讓遊戲流暢
            onBid('Pass'); 
            setSelected(null);
          }} 
          style={{ 
            flex: 1, 
            padding: '12px', 
            background: '#4caf50', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          PASS
        </button>

        {/* 確定按鈕：只有在選擇了數字叫牌時才啟用 */}
        <button 
          disabled={!selected || selected === 'Pass'} 
          onClick={handleConfirm} 
          style={{ 
            flex: 1, 
            padding: '12px', 
            background: (selected && selected !== 'Pass') ? '#2196f3' : '#ccc', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: (selected && selected !== 'Pass') ? 'pointer' : 'not-allowed',
            fontSize: '16px'
          }}
        >
          確定
        </button>
      </div>
    </div>
  );
};

export default BiddingBox;