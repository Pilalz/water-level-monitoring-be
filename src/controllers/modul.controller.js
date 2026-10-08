// src/controllers/modul.controller.js
const prisma = require("../lib/prisma");

// Helper hitung status koneksi telemetri per zona
const calculateZonaStatus = (waktuRekam) => {
  if (!waktuRekam) return { status: "OFFLINE", diffSeconds: null };
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(waktuRekam).getTime()) / 1000));
  if (diffSeconds <= 120) return { status: "ONLINE", diffSeconds };
  if (diffSeconds <= 500) return { status: "DELAYED", diffSeconds };
  return { status: "OFFLINE", diffSeconds };
};

// Helper agregasi status modul dari anak-anak zonanya
const calculateModulStatus = (zonaStatuses) => {
  if (!zonaStatuses || zonaStatuses.length === 0) return "OFFLINE";
  const total = zonaStatuses.length;
  const onlineCount = zonaStatuses.filter((s) => s === "ONLINE").length;
  const offlineCount = zonaStatuses.filter((s) => s === "OFFLINE").length;

  if (onlineCount === total) return "ONLINE"; // Semua zona online
  if (offlineCount === total) return "OFFLINE"; // Semua zona offline
  return "DELAYED"; // Campuran (sebagian online, sebagian delayed/offline)
};

/**
 * GET /api/modul
 * Mengambil daftar semua modul dengan kalkulasi status ONLINE/DELAYED/OFFLINE
 */
const getAllModul = async (req, res, next) => {
  try {
    const { status, includeZonas } = req.query;

    const modulList = await prisma.modul.findMany({
      include: {
        zonas: {
          include: {
            sensorData: {
              orderBy: { waktuRekam: "desc" },
              take: 1,
            },
          },
        },
        _count: {
          select: { zonas: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    let formatted = modulList.map((m) => {
      const zonasFormatted = (m.zonas || []).map((z) => {
        const latestReading = z.sensorData?.[0] || null;
        const { status: zonaStatus, diffSeconds } = calculateZonaStatus(latestReading?.waktuRekam);
        return {
          ...z,
          status: zonaStatus,
          diffSeconds,
          latestReading,
        };
      });

      const modulStatus = calculateModulStatus(zonasFormatted.map((z) => z.status));

      return {
        ...m,
        status: modulStatus,
        zonas: includeZonas === "true" || includeZonas === "1" ? zonasFormatted : undefined,
        totalZonas: zonasFormatted.length,
        onlineZonas: zonasFormatted.filter((z) => z.status === "ONLINE").length,
        delayedZonas: zonasFormatted.filter((z) => z.status === "DELAYED").length,
        offlineZonas: zonasFormatted.filter((z) => z.status === "OFFLINE").length,
      };
    });

    if (status && status !== "ALL") {
      formatted = formatted.filter((m) => m.status === String(status).toUpperCase());
    }

    res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/modul/:id
 * Mengambil detail 1 modul beserta daftar zonanya dengan status terkini
 */
const getModulById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const modul = await prisma.modul.findUnique({
      where: { id },
      include: {
        zonas: {
          include: {
            sensorData: {
              orderBy: { waktuRekam: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!modul) {
      return res.status(404).json({
        success: false,
        message: `Modul dengan ID '${id}' tidak ditemukan`,
      });
    }

    const zonasFormatted = (modul.zonas || []).map((z) => {
      const latestReading = z.sensorData?.[0] || null;
      const { status: zonaStatus, diffSeconds } = calculateZonaStatus(latestReading?.waktuRekam);
      return {
        ...z,
        status: zonaStatus,
        diffSeconds,
        latestReading,
      };
    });

    const modulStatus = calculateModulStatus(zonasFormatted.map((z) => z.status));

    res.status(200).json({
      success: true,
      data: {
        ...modul,
        status: modulStatus,
        zonas: zonasFormatted,
        totalZonas: zonasFormatted.length,
        onlineZonas: zonasFormatted.filter((z) => z.status === "ONLINE").length,
        delayedZonas: zonasFormatted.filter((z) => z.status === "DELAYED").length,
        offlineZonas: zonasFormatted.filter((z) => z.status === "OFFLINE").length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/modul
 * Membuat modul baru
 */
const createModul = async (req, res, next) => {
  try {
    const { kodeIot, kode_iot, nama, lokasi, keterangan, status } = req.body;
    const targetKodeIot = (kodeIot || kode_iot)?.trim();

    if (!targetKodeIot) {
      return res.status(400).json({
        success: false,
        message: "Field 'kodeIot' wajib diisi sebagai identitas hardware IoT",
      });
    }

    if (!nama || !nama.trim()) {
      return res.status(400).json({
        success: false,
        message: "Field 'nama' modul wajib diisi",
      });
    }

    // Validasi pencegahan duplikasi kodeIot
    const existing = await prisma.modul.findUnique({
      where: { kodeIot: targetKodeIot },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Kode IoT '${targetKodeIot}' sudah terdaftar pada modul '${existing.nama}'. Gunakan kode lain!`,
      });
    }

    const newModul = await prisma.modul.create({
      data: {
        kodeIot: targetKodeIot,
        nama: nama.trim(),
        lokasi: lokasi ? lokasi.trim() : null,
        keterangan: keterangan ? keterangan.trim() : null,
        status: status ? status.toUpperCase() : "AKTIF",
      },
    });

    res.status(201).json({
      success: true,
      message: "Modul berhasil dibuat",
      data: newModul,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Kode IoT sudah terdaftar di sistem",
      });
    }
    next(error);
  }
};

/**
 * PATCH /api/modul/:id
 * Mengupdate data modul
 */
const updateModul = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { kodeIot, kode_iot, nama, lokasi, keterangan, status } = req.body;

    // Cek apakah modul ada
    const existing = await prisma.modul.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Modul dengan ID '${id}' tidak ditemukan`,
      });
    }

    const updatedData = {};
    if (nama !== undefined) updatedData.nama = nama.trim();
    if (lokasi !== undefined) updatedData.lokasi = lokasi ? lokasi.trim() : null;
    if (keterangan !== undefined) updatedData.keterangan = keterangan ? keterangan.trim() : null;
    if (status !== undefined) updatedData.status = status.toUpperCase();

    //Anti duplikasi
    if (kodeIot !== undefined || kode_iot !== undefined) {
      const newKode = (kodeIot || kode_iot).trim();
      const duplicate = await prisma.modul.findFirst({
        where: {
          kodeIot: newKode,
          NOT: { id },
        },
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Kode IoT '${newKode}' sudah digunakan oleh modul '${duplicate.nama}'`,
        });
      }
      updatedData.kodeIot = newKode;
    }

    const updated = await prisma.modul.update({
      where: { id },
      data: updatedData,
    });

    res.status(200).json({
      success: true,
      message: "Modul berhasil diupdate",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/modul/:id
 * Menghapus modul (cascade menghapus zona terkait)
 */
const deleteModul = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.modul.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Modul dengan ID '${id}' tidak ditemukan`,
      });
    }

    await prisma.modul.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: `Modul '${existing.nama}' (${id}) beserta zona terkait berhasil dihapus`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllModul,
  getModulById,
  createModul,
  updateModul,
  deleteModul,
};
