// src/routes/user.route.js
const { Router } = require("express");
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
} = require("../controllers/user.controller");

const { verifyToken, authorizeRoles } = require("../middlewares/auth");

const router = Router();

router.use(verifyToken, authorizeRoles("ADMIN"));

router.route("/")
  .get(getAllUsers)
  .post(createUser);

router.patch("/:id/restore", restoreUser);

router.route("/:id")
  .get(getUserById)
  .patch(updateUser)
  .delete(deleteUser);

module.exports = router;
