require('dotenv').config();
const HighlightsGenerator = require('./src/services/highlights');
const DatabaseQueries = require('./src/database/queries');
const PriceOracle = require('./src/services/priceOracle');

async function regenerate() {
  const walletAddress = 'C3K1KmcWe97JdLvXhHg5SMCLKwbSBfv7nJ5c7BYGKJ8h';
  
  const positions = await DatabaseQueries.getPositions(walletAddress);
  const dailyPNL = await DatabaseQueries.getDailyPNL(walletAddress);
  const analysis = await DatabaseQueries.getAnalysis(walletAddress);
  const solPrice = await PriceOracle.getSolPriceUSD();
  
  const highlights = await HighlightsGenerator.generate(positions, dailyPNL, analysis, solPrice);

  // Upsert each highlight
  for (let i = 0; i < highlights.length; i++) {
    highlights[i].rank = i + 1;
    await DatabaseQueries.upsertHighlight(walletAddress, highlights[i]);
  }

  console.log('Regenerated highlights:');
  for (const h of highlights.slice(1, 4)) {
    console.log('-', h.title + ':', h.description);
  }
  process.exit(0);
}
regenerate().catch(e => { console.error(e); process.exit(1); });
