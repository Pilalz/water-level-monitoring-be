// src/routes/index.js
// Central route aggregator
const { Router } = require("express");
const modulRoutes = require("./modul.route");
const zonaRoutes = require("./zona.route");
const sensorDataRoutes = require("./sensorData.route");
const alertLogRoutes = require("./alertLog.route");
const authRoutes = require("./auth.route");
const userRoutes = require("./user.route");
const activityLogRoutes = require("./activityLog.route");

const router = Router();

// Health Check
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Water Level Monitoring API is running smoothly",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    endpoints: {
      auth: "/api/auth",
      user: "/api/user",
      modul: "/api/modul",
      zona: "/api/zona",
      sensorData: "/api/sensor-data",
      alerts: "/api/alerts",
      activityLogs: "/api/activity-logs",
    },
  });
});

// Primary Domain Routes
router.use("/auth", authRoutes);
router.use("/user", userRoutes);
router.use("/users", userRoutes); // Alias
router.use("/activity-logs", activityLogRoutes);
router.use("/modul", modulRoutes);
router.use("/zona", zonaRoutes);
router.use("/sensor-data", sensorDataRoutes);
router.use("/alerts", alertLogRoutes);

// Compatibility aliases
router.use("/water-level", sensorDataRoutes);
router.use("/devices", modulRoutes);

module.exports = router;
