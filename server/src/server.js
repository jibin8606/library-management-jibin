const mongoose = require('mongoose');
const config = require('./config');
const app = require('./app');
const { ensureIndexes } = require('./models');

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  await ensureIndexes();
  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}  (db: ${mongoose.connection.name})`); // eslint-disable-line no-console
  });
}

main().catch((err) => {
  console.error('Failed to start:', err.message); // eslint-disable-line no-console
  process.exit(1);
});
