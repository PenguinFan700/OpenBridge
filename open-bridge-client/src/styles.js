export const styles = {
  lobby: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', backgroundColor: '#222', color: 'white' },
  table: { display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gridTemplateRows: '1fr 2fr 1fr', height: '100vh', width: '100vw', backgroundColor: '#1a472a', color: 'white', position: 'relative', overflow: 'hidden' },
  seatBox: { border: '1px solid #ffffffaa', borderRadius: '8px', padding: '12px', textAlign: 'center', backgroundColor: 'transparent', width: '160px', height: 'auto', boxSizing: 'border-box' },
  center: { gridColumn: '2', gridRow: '2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ffffff55', margin: '40px', borderRadius: '15px' },
  card: { padding: '8px', background: 'white', color: 'black', borderRadius: '4px', margin: '2px', display: 'inline-block', width: '38px', fontWeight: 'bold', textAlign: 'center' },
  btnAction: { padding: '8px 16px', cursor: 'pointer', border: 'none', borderRadius: '4px', backgroundColor: 'white', color: 'black', fontWeight: 'bold' },
  btnSmall: { padding: '5px 15px', cursor: 'pointer', border: 'none', borderRadius: '4px', backgroundColor: 'white', color: 'black', fontWeight: 'bold' },
  btnCenter: { padding: '10px 20px', borderRadius: '4px', border: 'none', fontWeight: 'bold', margin: '5px', width: '130px', cursor: 'pointer' },
  specArea: { position: 'absolute', bottom: '20px', right: '20px', zIndex: 1000 }
};
// 建議的按鈕樣式微調
const btnReady = { ...styles.btnSmall, backgroundColor: '#27ae60', color: 'white' };
const btnLeave = { 
  ...styles.btnSmall, 
  backgroundColor: 'transparent', 
  color: '#e67e22', 
  border: '1px solid #e67e22',
  cursor: 'pointer'
};