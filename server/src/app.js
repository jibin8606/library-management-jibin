const express = require('express');
const cors = require('cors');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '100kb' }));

app.get('/', (req, res) =>
  res.json({
    name: 'Library Management API',
    status: 'running',
    health: '/api/health',
    docs: 'See API.md. All routes live under /api (e.g. POST /api/auth/login, GET /api/books).',
    frontend: config.corsOrigin,
  })
);
app.get('/api', (req, res) => res.redirect('/'));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/books', require('./routes/books'));
app.use('/api/copies', require('./routes/copies'));
app.use('/api/loans', require('./routes/loans'));
app.use('/api/reports', require('./routes/reports'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
