// src/controllers/activityLog.controller.js
const prisma = require("../lib/prisma");

/**
 * GET /api/activity-logs
 * Mengambil daftar riwayat aktivitas sistem (Khusus Admin)
 */
const getActivityLogs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      entity,
      action,
      search,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = {};

    if (entity && entity !== "ALL") {
      where.entity = entity.toUpperCase();
    }

    if (action && action !== "ALL") {
      where.action = action.toUpperCase();
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { username: { contains: q, mode: "insensitive" } },
        { details: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getActivityLogs,
};
