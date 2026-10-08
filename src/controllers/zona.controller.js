// src/controllers/zona.controller.js
const prisma = require("../lib/prisma");

/**
 * GET /api/zona
 * Mengambil semua zona, opsional filter berdasarkan idModul atau status
 */
const getAllZona = async (req, res, next) => {
  try {
    const { idModul, status } = req.query;

    const where = {};
    if (idModul) where.idModul = idModul;
    if (status) where.status = String(status).toUpperCase();

    const zonas = await prisma.zona.findMany({
      where,
      include: {
        modul: {
          select: { id: true, kodeIot: true, nama: true, lokasi: true, status: true },
        },
        sensorData: {
          orderBy: { waktuRekam: "desc" },
          take: 1, // Pembacaan terakhir
        },
        _count: {
          select: {
            alertLogs: {
              where: { isResolved: false }, // jumlah alert aktif
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Helper hitung status koneksi telemetri IoT
    const calculateConnectionStatus = (waktuRekam) => {
      if (!waktuRekam) {
        return { statusKoneksi: "OFFLINE", diffSeconds: null };
      }
      const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(waktuRekam).getTime()) / 1000));
      let statusKoneksi = "OFFLINE";
      if (diffSeconds <= 120) {
        statusKoneksi = "ONLINE";
      } else if (diffSeconds <= 500) {
        statusKoneksi = "DELAYED";
      } else {
        statusKoneksi = "OFFLINE";
      }
      return { statusKoneksi, diffSeconds };
    };

    // Format response agar pembacaan sensor terbaru mudah diakses
    const formatted = zonas.map((z) => {
      const latestReading = z.sensorData[0] || null;
      const conn = calculateConnectionStatus(latestReading?.waktuRekam);

      return {
        ...z,
        latestReading,
        statusKoneksi: conn.statusKoneksi,
        diffSeconds: conn.diffSeconds,
        unresolvedAlertsCount: z._count.alertLogs,
      };
    });

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
 * GET /api/zona/:id
 * Detail zona + modul + 10 pembacaan sensor terakhir + alert logs aktif
 */
const getZonaById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const zona = await prisma.zona.findUnique({
      where: { id },
      include: {
        modul: true,
        sensorData: {
          orderBy: { waktuRekam: "desc" },
          take: 20,
        },
        alertLogs: {
          where: { isResolved: false },
          orderBy: { waktuAlert: "desc" },
          take: 10,
        },
      },
    });

    if (!zona) {
      return res.status(404).json({
        success: false,
        message: `Zona dengan ID '${id}' tidak ditemukan`,
      });
    }

    const latestReading = zona.sensorData[0] || null;
    let statusKoneksi = "OFFLINE";
    let diffSeconds = null;

    if (latestReading && latestReading.waktuRekam) {
      diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(latestReading.waktuRekam).getTime()) / 1000));
      if (diffSeconds <= 120) {
        statusKoneksi = "ONLINE";
      } else if (diffSeconds <= 500) {
        statusKoneksi = "DELAYED";
      } else {
        statusKoneksi = "OFFLINE";
      }
    }

    res.status(200).json({
      success: true,
      data: {
        ...zona,
        latestReading,
        statusKoneksi,
        diffSeconds,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/zona
 * Menambahkan zona baru ke dalam suatu modul
 */
const createZona = async (req, res, next) => {
  try {
    const {
      idModul,
      id_modul,
      kodeZona,
      kode_zona,
      namaZona,
      nama_zona,
      tinggiMaks,
      tinggi_maks,
      voltMin,
      volt_min,
      voltMaks,
      volt_maks,
      satuan = "cm",
      batasWaspada,
      batas_waspada,
      batasBahaya,
      batas_bahaya,
      batasKritis,
      batas_kritis,
      status = "AKTIF",
    } = req.body;

    const targetModulId = idModul || id_modul;
    const targetKodeZona = kodeZona || kode_zona;
    const targetNamaZona = namaZona || nama_zona;
    const targetTinggiMaks = tinggiMaks ?? tinggi_maks;
    const targetBatasWaspada = batasWaspada ?? batas_waspada;
    const targetBatasBahaya = batasBahaya ?? batas_bahaya;
    const targetBatasKritis = batasKritis ?? batas_kritis;

    // Validasi input wajib
    if (!targetModulId) {
      return res.status(400).json({ success: false, message: "Field 'idModul' wajib diisi" });
    }
    if (!targetKodeZona || !targetKodeZona.trim()) {
      return res.status(400).json({ success: false, message: "Field 'kodeZona' wajib diisi" });
    }
    if (!targetNamaZona || !targetNamaZona.trim()) {
      return res.status(400).json({ success: false, message: "Field 'namaZona' wajib diisi" });
    }
    if (targetTinggiMaks === undefined || targetBatasWaspada === undefined || targetBatasBahaya === undefined || targetBatasKritis === undefined) {
      return res.status(400).json({
        success: false,
        message: "Field konfigurasi ('tinggiMaks', 'batasWaspada', 'batasBahaya', 'batasKritis') wajib diisi",
      });
    }

    // Pastikan modul induk ada
    const modul = await prisma.modul.findUnique({ where: { id: targetModulId } });
    if (!modul) {
      return res.status(404).json({
        success: false,
        message: `Modul induk dengan ID '${targetModulId}' tidak ditemukan`,
      });
    }

    const newZona = await prisma.zona.create({
      data: {
        idModul: targetModulId,
        kodeZona: targetKodeZona.trim(),
        namaZona: targetNamaZona.trim(),
        tinggiMaks: parseFloat(targetTinggiMaks),
        voltMin: (voltMin ?? volt_min) !== undefined && (voltMin ?? volt_min) !== null ? parseFloat(voltMin ?? volt_min) : null,
        voltMaks: (voltMaks ?? volt_maks) !== undefined && (voltMaks ?? volt_maks) !== null ? parseFloat(voltMaks ?? volt_maks) : null,
        satuan: satuan || "cm",
        batasWaspada: parseFloat(targetBatasWaspada),
        batasBahaya: parseFloat(targetBatasBahaya),
        batasKritis: parseFloat(targetBatasKritis),
        status: status ? status.toUpperCase() : "AKTIF",
      },
    });

    res.status(201).json({
      success: true,
      message: "Zona berhasil dibuat",
      data: newZona,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/zona/:id
 * Mengupdate data atau ambang batas zona
 */
const updateZona = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.zona.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Zona dengan ID '${id}' tidak ditemukan`,
      });
    }

    const updateData = {};
    //Anti duplikasi
    if (body.kodeZona || body.kode_zona) {
      const newKode = (body.kodeZona || body.kode_zona).trim();
      const duplicate = await prisma.zona.findFirst({
        where: {
          kodeZona: newKode,
          NOT: { id },
        },
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Kode Zona '${newKode}' sudah digunakan oleh zona '${duplicate.namaZona}'`,
        });
      }
      updateData.kodeZona = newKode;
    }

    if (body.namaZona || body.nama_zona) updateData.namaZona = (body.namaZona || body.nama_zona).trim();
    if (body.tinggiMaks !== undefined || body.tinggi_maks !== undefined) updateData.tinggiMaks = parseFloat(body.tinggiMaks ?? body.tinggi_maks);
    if (body.batasWaspada !== undefined || body.batas_waspada !== undefined) updateData.batasWaspada = parseFloat(body.batasWaspada ?? body.batas_waspada);
    if (body.batasBahaya !== undefined || body.batas_bahaya !== undefined) updateData.batasBahaya = parseFloat(body.batasBahaya ?? body.batas_bahaya);
    if (body.batasKritis !== undefined || body.batas_kritis !== undefined) updateData.batasKritis = parseFloat(body.batasKritis ?? body.batas_kritis);
    if (body.voltMin !== undefined || body.volt_min !== undefined) updateData.voltMin = parseFloat(body.voltMin ?? body.volt_min);
    if (body.voltMaks !== undefined || body.volt_maks !== undefined) updateData.voltMaks = parseFloat(body.voltMaks ?? body.volt_maks);
    if (body.satuan !== undefined) updateData.satuan = body.satuan;
    if (body.status !== undefined) updateData.status = body.status.toUpperCase();

    const updated = await prisma.zona.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Zona berhasil diupdate",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/zona/:id
 * Menghapus zona beserta data sensor & alert terkait (cascade)
 */
const deleteZona = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.zona.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Zona dengan ID '${id}' tidak ditemukan`,
      });
    }

    await prisma.zona.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: `Zona '${existing.namaZona}' (${id}) berhasil dihapus`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllZona,
  getZonaById,
  createZona,
  updateZona,
  deleteZona,
};
