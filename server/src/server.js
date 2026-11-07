require('dotenv').config();
const app = require('./app');
const { port } = require('./config');

app.listen(port, () => console.log(`TrustVault API listening on port ${port}`));
