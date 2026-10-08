// src/middlewares/errorHandler.js
// Centralized error handling middleware

/**
 * 404 Not Found handler — dipasang setelah semua route
 */
const notFound = (req, res, next) => {
  const error = new Error(`Not Found — ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * Global error handler — dipasang paling terakhir di app.js
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || res.statusCode === 200 ? err.statusCode || 500 : res.statusCode;
  const isDev = process.env.NODE_ENV === "development";

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    // Stack trace hanya tampil saat development
    ...(isDev && { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };
