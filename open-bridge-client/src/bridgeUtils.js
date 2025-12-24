// bridgeUtils.js

export const SUIT_ORDER = { 'S': 4, 'H': 3, 'D': 2, 'C': 1 };
export const RANK_ORDER = { 
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 
};

export const sortHand = (h) => {
  if (!h || h.length === 0) return [];
  
  return [...h].sort((a, b) => {
    const [suitA, rankA] = a.split('-');
    const [suitB, rankB] = b.split('-');

    // 1. 先比花色 (左邊放大的花色)
    if (SUIT_ORDER[suitA] !== SUIT_ORDER[suitB]) {
      return SUIT_ORDER[suitB] - SUIT_ORDER[suitA];
    }

    // 2. 同花色比點數 (左小右大)
    return RANK_ORDER[rankA] - RANK_ORDER[rankB];
  });
};

export const isLegalBid = (lastBid, newBid) => {
  if (newBid === 'Pass') return true;
  if (!lastBid) return true;
  const BID_SUIT_ORDER = { 'C': 1, 'D': 2, 'H': 3, 'S': 4, 'NT': 5 };
  const l1 = parseInt(lastBid[0]), s1 = lastBid.substring(1), 
        l2 = parseInt(newBid[0]), s2 = newBid.substring(1);
  return (l2 > l1) || (l2 === l1 && BID_SUIT_ORDER[s2] > BID_SUIT_ORDER[s1]);
};