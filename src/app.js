const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");

const routes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/errorHandler");

// BigInt JSON serialization fix (dibutuhkan Prisma BigInt id di PostgreSQL)
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const app = express();

// Security
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── Body Parsing ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Request Logging ──────────────────────────────────────────
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// ─── Routes ───────────────────────────────────────────────────
app.use("/api", routes);

// ─── Error Handlers (HARUS di bawah semua route) ──────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
