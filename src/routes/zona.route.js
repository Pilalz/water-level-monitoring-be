// src/routes/zona.route.js
const { Router } = require("express");
const {
  getAllZona,
  getZonaById,
  createZona,
  updateZona,
  deleteZona,
  restoreZona,
} = require("../controllers/zona.controller");
const { verifyToken, authorizeRoles } = require("../middlewares/auth");

const router = Router();

router.use(verifyToken);

router.route("/")
  .get(authorizeRoles("ADMIN", "OPERATOR", "VIEWER"), getAllZona)
  .post(authorizeRoles("ADMIN", "OPERATOR"), createZona);

router.patch("/:id/restore", authorizeRoles("ADMIN", "OPERATOR"), restoreZona);

router.route("/:id")
  .get(authorizeRoles("ADMIN", "OPERATOR", "VIEWER"), getZonaById)
  .patch(authorizeRoles("ADMIN", "OPERATOR"), updateZona)
  .delete(authorizeRoles("ADMIN", "OPERATOR"), deleteZona);

module.exports = router;
