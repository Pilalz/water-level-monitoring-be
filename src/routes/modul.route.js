// src/routes/modul.route.js
const { Router } = require("express");
const {
  getAllModul,
  getModulById,
  createModul,
  updateModul,
  deleteModul,
  restoreModul,
} = require("../controllers/modul.controller");

const { verifyToken, authorizeRoles } = require("../middlewares/auth");

const router = Router();

router.use(verifyToken);

router.route("/")
  .get(authorizeRoles("ADMIN", "OPERATOR", "VIEWER"), getAllModul)
  .post(authorizeRoles("ADMIN", "OPERATOR"), createModul);

router.patch("/:id/restore", authorizeRoles("ADMIN", "OPERATOR"), restoreModul);

router.route("/:id")
  .get(authorizeRoles("ADMIN", "OPERATOR", "VIEWER"), getModulById)
  .patch(authorizeRoles("ADMIN", "OPERATOR"), updateModul)
  .delete(authorizeRoles("ADMIN", "OPERATOR"), deleteModul);

module.exports = router;
