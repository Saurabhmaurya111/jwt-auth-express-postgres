function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
}

function errorHandler(err, req, res, next) {
  console.error(err.stack);

  // Handle known Postgres unique-violation (duplicate email) gracefully
  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'Email already in use' });
  }

  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({ success: false, message });
}

module.exports = { notFoundHandler, errorHandler };
