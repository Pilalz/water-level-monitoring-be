// src/controllers/alertLog.controller.js
const prisma = require("../lib/prisma");

/**
 * GET /api/alerts
 * Mengambil histori alert dengan pagination dan filter
 */
const getAllAlerts = async (req, res, next) => {
  try {
    const { idZona, levelStatus, isResolved, limit = 20, page = 1 } = req.query;

    const where = {};
    if (idZona) where.idZona = idZona;
    if (levelStatus) where.levelStatus = String(levelStatus).toUpperCase();
    if (isResolved !== undefined) {
      where.isResolved = isResolved === "true" || isResolved === "1";
    }

    const take = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [total, alerts] = await Promise.all([
      prisma.alertLog.count({ where }),
      prisma.alertLog.findMany({
        where,
        take,
        skip,
        orderBy: { waktuAlert: "desc" },
        include: {
          zona: {
            select: {
              id: true,
              namaZona: true,
              satuan: true,
              modul: { select: { id: true, nama: true } },
            },
          },
        },
      }),
    ]);

    const formatted = alerts.map((a) => ({
      id: a.id.toString(),
      idZona: a.idZona,
      namaZona: a.zona?.namaZona,
      modulNama: a.zona?.modul?.nama,
      levelStatus: a.levelStatus,
      pesanAlert: a.pesanAlert,
      isResolved: a.isResolved,
      waktuAlert: a.waktuAlert,
    }));

    res.status(200).json({
      success: true,
      pagination: {
        total,
        page: parseInt(page, 10) || 1,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/alerts/:id/resolve
 * Menandai alert sebagai sudah ditangani (resolved)
 */
const resolveAlert = async (req, res, next) => {
  try {
    const { id } = req.params;

    let alertId;
    try {
      alertId = BigInt(id);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Format ID alert tidak valid",
      });
    }

    const existing = await prisma.alertLog.findUnique({
      where: { id: alertId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Alert dengan ID '${id}' tidak ditemukan`,
      });
    }

    const updated = await prisma.alertLog.update({
      where: { id: alertId },
      data: { isResolved: true },
    });

    res.status(200).json({
      success: true,
      message: "Alert berhasil ditandai sebagai resolved",
      data: {
        id: updated.id.toString(),
        isResolved: updated.isResolved,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/alerts/summary
 * Mengambil ringkasan jumlah alert yang belum terselesaikan
 */
const getAlertSummary = async (req, res, next) => {
  try {
    const unresolved = await prisma.alertLog.groupBy({
      by: ["levelStatus"],
      where: { isResolved: false },
      _count: { id: true },
    });

    const summary = {
      WASPADA: 0,
      BAHAYA: 0,
      KRITIS: 0,
      totalUnresolved: 0,
    };

    unresolved.forEach((item) => {
      if (summary[item.levelStatus] !== undefined) {
        summary[item.levelStatus] = item._count.id;
      }
      summary.totalUnresolved += item._count.id;
    });

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllAlerts,
  resolveAlert,
  getAlertSummary,
};
