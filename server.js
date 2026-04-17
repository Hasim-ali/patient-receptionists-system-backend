// server.js — Entry point
require('dotenv').config();
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const swaggerUi  = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const routes     = require('./routes/index');
const { startScheduler } = require('./utils/scheduler');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json());

// ── Swagger UI ────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Receptionist API Docs',
  swaggerOptions: { persistAuthorization: true }
}));

// ── API Routes ────────────────────────────────────────────────
app.use('/api', routes);

// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  status:  'Receptionist backend running',
  version: '2.0.0',
  docs:    `http://localhost:${PORT}/api-docs`
}));

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Global Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📖 API Docs: http://localhost:${PORT}/api-docs`);
  startScheduler();
});