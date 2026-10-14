// src/lib/activityLogger.js
const prisma = require("./prisma");

/**
 * Mencatat riwayat aktivitas pengguna ke tabel activity_log
 * @param {Object} params
 * @param {Object} [params.req] - Request Express (untuk mengambil userId / role)
 * @param {string} params.action - CREATE | UPDATE | DELETE | RESTORE | RESOLVE | LOGIN
 * @param {string} params.entity - MODUL | ZONA | USER | ALERT | AUTH
 * @param {string|number} [params.entityId] - ID entitas terkait
 * @param {string|Object} [params.details] - Deskripsi atau detail payload
 * @param {Object} [params.user] - Override data user { id, username }
 */
const logActivity = async ({ req, action, entity, entityId, details, user: explicitUser }) => {
  try {
    const userId = explicitUser?.id || req?.user?.userId || null;
    let username = explicitUser?.username || req?.user?.username || null;

    // Jika username belum ada tetapi userId ada, cari username dari DB
    if (userId && !username) {
      try {
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { username: true },
        });
        username = u?.username || null;
      } catch {
        // Abaikan jika query lookup gagal
      }
    }

    const detailText =
      typeof details === "object" ? JSON.stringify(details) : String(details || "");

    await prisma.activityLog.create({
      data: {
        userId,
        username: username || "System",
        action: action.toUpperCase(),
        entity: entity.toUpperCase(),
        entityId: entityId ? String(entityId) : null,
        details: detailText,
      },
    });
  } catch (error) {
    // Logging aktivitas tidak boleh memblokir alur utama jika gagal
    console.error("Gagal mencatat log aktivitas:", error.message);
  }
};

module.exports = { logActivity };
