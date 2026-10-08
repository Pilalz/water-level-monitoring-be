// src/routes/modul.route.js
const { Router } = require("express");
const {
  getAllModul,
  getModulById,
  createModul,
  updateModul,
  deleteModul,
} = require("../controllers/modul.controller");

const router = Router();

router.route("/")
  .get(getAllModul)
  .post(createModul);

router.route("/:id")
  .get(getModulById)
  .patch(updateModul)
  .delete(deleteModul);

module.exports = router;
