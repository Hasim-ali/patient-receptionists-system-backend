// server.js — Entry point
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const routes = require('./routes/index');
const { startScheduler } = require('./utils/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use('/api', routes);

// Health check
app.get('/', (req, res) => res.json({ status: 'Receptionist backend running' }));

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startScheduler();
});