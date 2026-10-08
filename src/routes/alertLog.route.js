// src/routes/alertLog.route.js
const { Router } = require("express");
const {
  getAllAlerts,
  resolveAlert,
  getAlertSummary,
} = require("../controllers/alertLog.controller");

const router = Router();

router.get("/summary", getAlertSummary);
router.get("/", getAllAlerts);
router.patch("/:id/resolve", resolveAlert);

module.exports = router;
