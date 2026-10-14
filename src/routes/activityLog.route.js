// src/routes/activityLog.route.js
const { Router } = require("express");
const { getActivityLogs } = require("../controllers/activityLog.controller");
const { verifyToken, authorizeRoles } = require("../middlewares/auth");

const router = Router();

// Hanya role ADMIN yang boleh melihat riwayat Activity Logs
router.use(verifyToken, authorizeRoles("ADMIN"));

router.get("/", getActivityLogs);

module.exports = router;
