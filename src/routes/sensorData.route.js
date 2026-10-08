// src/routes/sensorData.route.js
const { Router } = require("express");
const {
  recordSensorData,
  getSensorData,
  getLatestSensorData,
} = require("../controllers/sensorData.controller");

const router = Router();

router.get("/latest", getLatestSensorData);

router.route("/")
  .get(getSensorData)
  .post(recordSensorData);

module.exports = router;
