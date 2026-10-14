const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // 1. Cari user berdasarkan username
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(404).json({ message: "User tidak ditemukan" });

    // 2. Cek kecocokan password (asumsi password di DB sudah di-hash saat register)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Password salah" });

    // 3. BUAT TIKET (JWT). Selipkan ID dan ROLE di dalamnya!
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || "default_jwt_secret_key",
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    res.status(200).json({
      success: true,
      token: token,
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  try {
    const { username, password, role = "VIEWER" } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username dan password wajib diisi",
      });
    }

    const validRoles = ["ADMIN", "OPERATOR", "VIEWER"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role tidak valid. Pilihan role: ${validRoles.join(", ")}`,
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username sudah terdaftar",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role,
      },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      success: true,
      message: "Registrasi berhasil",
      user: newUser,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { login, register };