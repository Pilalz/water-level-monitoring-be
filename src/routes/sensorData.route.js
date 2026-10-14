// src/routes/sensorData.route.js
const { Router } = require("express");
const {
  recordSensorData,
  getSensorData,
  getLatestSensorData,
} = require("../controllers/sensorData.controller");
const { verifyToken, authorizeRoles } = require("../middlewares/auth");

const router = Router();

// Endpoint baca data diproteksi RBAC (Dashboard viewer/operator/admin)
router.get(
  "/latest",
  verifyToken,
  authorizeRoles("ADMIN", "OPERATOR", "VIEWER"),
  getLatestSensorData
);

router.route("/")
  .get(
    verifyToken,
    authorizeRoles("ADMIN", "OPERATOR", "VIEWER"),
    getSensorData
  )
  // POST terbuka untuk ingestion data sensor dari simulator (datadummy.py) / modul IoT
  .post(recordSensorData);

module.exports = router;
