// src/routes/zona.route.js
const { Router } = require("express");
const {
  getAllZona,
  getZonaById,
  createZona,
  updateZona,
  deleteZona,
} = require("../controllers/zona.controller");

const router = Router();

router.route("/")
  .get(getAllZona)
  .post(createZona);

router.route("/:id")
  .get(getZonaById)
  .patch(updateZona)
  .delete(deleteZona);

module.exports = router;
