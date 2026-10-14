const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");
const { logActivity } = require("../lib/activityLogger");

// Helper field selector agar hash password tidak pernah bocor ke client
const userSelect = {
  id: true,
  username: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
};

/**
 * GET /api/users
 * Mengambil daftar seluruh user
 * Query: includeDeleted=true untuk menampilkan user yang sudah di-soft-delete
 */
const getAllUsers = async (req, res, next) => {
  try {
    const { includeDeleted } = req.query;

    const where = {};
    if (includeDeleted !== "true") {
      where.deletedAt = null;
    }

    const userList = await prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      data: userList,
      count: userList.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:id
 * Mengambil detail 1 user
 */
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User dengan ID '${id}' tidak ditemukan`,
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users
 * Membuat user baru (Hanya Admin)
 */
const createUser = async (req, res, next) => {
  try {
    const { username, password, role = "VIEWER" } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({
        success: false,
        message: "Username wajib diisi",
      });
    }

    if (!password || password.trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password wajib diisi minimal 6 karakter",
      });
    }

    const cleanUsername = username.trim();
    const cleanRole = String(role).toUpperCase();
    const validRoles = ["ADMIN", "OPERATOR", "VIEWER"];

    if (!validRoles.includes(cleanRole)) {
      return res.status(400).json({
        success: false,
        message: `Role tidak valid. Pilihan role: ${validRoles.join(", ")}`,
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: `Username '${cleanUsername}' sudah terdaftar`,
      });
    }

    const hashedPassword = await bcrypt.hash(password.trim(), 10);
    const newUser = await prisma.user.create({
      data: {
        username: cleanUsername,
        password: hashedPassword,
        role: cleanRole,
      },
      select: userSelect,
    });

    await logActivity({
      req,
      action: "CREATE",
      entity: "USER",
      entityId: newUser.id,
      details: `User '${newUser.username}' dengan role '${newUser.role}' berhasil dibuat`,
    });

    res.status(201).json({
      success: true,
      message: `User '${newUser.username}' berhasil dibuat`,
      data: newUser,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/users/:id
 * Mengupdate data user (Hanya Admin)
 */
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, password, role } = req.body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `User dengan ID '${id}' tidak ditemukan`,
      });
    }

    const updatedData = {};

    // 1. Validasi & Update Username
    if (username !== undefined) {
      const cleanUsername = username.trim();
      if (!cleanUsername) {
        return res.status(400).json({
          success: false,
          message: "Username tidak boleh kosong",
        });
      }

      // Cek duplikasi jika username berubah
      if (cleanUsername !== existing.username) {
        const duplicate = await prisma.user.findFirst({
          where: {
            username: cleanUsername,
            NOT: { id },
          },
        });
        if (duplicate) {
          return res.status(409).json({
            success: false,
            message: `Username '${cleanUsername}' sudah digunakan oleh user lain`,
          });
        }
      }
      updatedData.username = cleanUsername;
    }

    // 2. Validasi & Update Role
    if (role !== undefined) {
      const cleanRole = String(role).toUpperCase();
      const validRoles = ["ADMIN", "OPERATOR", "VIEWER"];
      if (!validRoles.includes(cleanRole)) {
        return res.status(400).json({
          success: false,
          message: `Role tidak valid. Pilihan role: ${validRoles.join(", ")}`,
        });
      }

      // Mencegah downgrade jika ini adalah satu-satunya admin
      if (existing.role === "ADMIN" && cleanRole !== "ADMIN") {
        const adminCount = await prisma.user.count({ where: { role: "ADMIN", deletedAt: null } });
        if (adminCount <= 1) {
          return res.status(400).json({
            success: false,
            message: "Tidak dapat mengubah role satu-satunya admin pada sistem",
          });
        }
      }

      updatedData.role = cleanRole;
    }

    // 3. Validasi & Update Password (opsional saat edit)
    if (password !== undefined && password.trim() !== "") {
      if (password.trim().length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password baru minimal 6 karakter",
        });
      }
      updatedData.password = await bcrypt.hash(password.trim(), 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updatedData,
      select: userSelect,
    });

    await logActivity({
      req,
      action: "UPDATE",
      entity: "USER",
      entityId: updated.id,
      details: `User '${updated.username}' diperbarui`,
    });

    res.status(200).json({
      success: true,
      message: `User '${updated.username}' berhasil diperbarui`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/users/:id
 * Soft-delete user (Hanya Admin)
 */
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `User dengan ID '${id}' tidak ditemukan`,
      });
    }

    // Mencegah admin menghapus akunnya sendiri yang sedang aktif
    if (req.user && req.user.userId === id) {
      return res.status(400).json({
        success: false,
        message: "Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif",
      });
    }

    // Mencegah penghapusan jika ini adalah admin terakhir yang aktif
    if (existing.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN", deletedAt: null } });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: "Tidak dapat menghapus satu-satunya akun ADMIN yang tersisa",
        });
      }
    }

    if (existing.deletedAt) {
      return res.status(400).json({
        success: false,
        message: `User '${existing.username}' sudah dihapus sebelumnya`,
      });
    }

    const deleted = await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: userSelect,
    });

    await logActivity({
      req,
      action: "DELETE",
      entity: "USER",
      entityId: id,
      details: `User '${existing.username}' (${existing.role}) di-soft-delete`,
    });

    res.status(200).json({
      success: true,
      message: `User '${existing.username}' berhasil dihapus (soft delete)`,
      data: deleted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/users/:id/restore
 * Memulihkan user yang di-soft-delete (Hanya Admin)
 */
const restoreUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `User dengan ID '${id}' tidak ditemukan`,
      });
    }

    if (!existing.deletedAt) {
      return res.status(400).json({
        success: false,
        message: `User '${existing.username}' tidak dalam kondisi terhapus`,
      });
    }

    const restored = await prisma.user.update({
      where: { id },
      data: { deletedAt: null },
      select: userSelect,
    });

    await logActivity({
      req,
      action: "RESTORE",
      entity: "USER",
      entityId: id,
      details: `User '${existing.username}' (${existing.role}) dipulihkan (restore)`,
    });

    res.status(200).json({
      success: true,
      message: `User '${existing.username}' berhasil dipulihkan`,
      data: restored,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
};