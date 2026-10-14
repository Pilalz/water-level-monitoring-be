// src/routes/alertLog.route.js
const { Router } = require("express");
const {
  getAllAlerts,
  resolveAlert,
  getAlertSummary,
} = require("../controllers/alertLog.controller");
const { verifyToken, authorizeRoles } = require("../middlewares/auth");

const router = Router();

router.use(verifyToken);

router.get("/summary", authorizeRoles("ADMIN", "OPERATOR", "VIEWER"), getAlertSummary);
router.get("/", authorizeRoles("ADMIN", "OPERATOR", "VIEWER"), getAllAlerts);
router.patch("/:id/resolve", authorizeRoles("ADMIN", "OPERATOR"), resolveAlert);

module.exports = router;
