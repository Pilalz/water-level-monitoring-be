// src/controllers/sensorData.controller.js
const prisma = require("../lib/prisma");

/**
 * Helper 1 untuk menentukan level status berdasarkan threshold zona
 */
function calculateWaterStatus(ketinggian, zona) {
  const level = parseFloat(ketinggian);
  const kritis = parseFloat(zona.batasKritis);
  const bahaya = parseFloat(zona.batasBahaya);
  const waspada = parseFloat(zona.batasWaspada);

  if (level >= kritis) return "KRITIS";
  if (level >= bahaya) return "BAHAYA";
  if (level >= waspada) return "WASPADA";
  return "AMAN";
}

// Helper 2 Hitung Ademco Checksum
const calculateAdemcoChecksum = (payload18) => {
  let sum = 0;
  for (let i = 0; i < 18; i++) {
    const char = payload18[i].toUpperCase();
    
    if (char >= '1' && char <= '9') sum += parseInt(char);
    else if (char === '0' || char === 'D') sum += 10; // Asumsi D=10 jika merujuk Ademco asli (atau D=0 sesuai rule mu, ubah jika perlu)
    else if (char === '*') sum += 11;
    else if (char === '#') sum += 12;
    else if (char === 'A') sum += 13;
    else if (char === 'B') sum += 14;
    else if (char === 'C') sum += 15;
    
    if (char === 'D') sum -= 10;
  }

  const mod = sum % 15;
  // PadStart memastikan hasil 1 digit (misal 8) menjadi '08'
  return mod.toString(16).padStart(2, '0').toUpperCase();
};

// Helper 3 Parser Tanggal (DDMMYYHHmm -> Object Date)
const parseIoTDate = (dateStr) => {
  const day = dateStr.slice(0, 2);
  const month = dateStr.slice(2, 4);
  const year = `20${dateStr.slice(4, 6)}`; // Asumsi tahun 20xx
  const hour = dateStr.slice(6, 8);
  const minute = dateStr.slice(8, 10);
  
  // Asumsi zona waktu Indonesia/WIB (+07:00), sesuaikan jika IoT pakai UTC
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00+07:00`);
};

// Helper 4 menghitung ketinggian
function hitungKetinggianDariVoltase(zona, voltase) {
  //Level = (V − V_min) / (V_max − V_min) × H_max
  const level = ((voltase - zona.voltMin) / (zona.voltMaks - zona.voltMin)) * zona.tinggiMaks;

  return level;
}

// Helper 5 Format durasi elapsed time menjadi string yang human-readable.
function formatElapsedDuration(diffSeconds) {
  if (diffSeconds < 60) {
    return `${diffSeconds} detik`;
  }

  const minutes = Math.floor(diffSeconds / 60);
  const seconds = diffSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes} mnt ${seconds} dtk` : `${minutes} mnt`;
  }

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;

  if (hours < 24) {
    return remMinutes > 0 ? `${hours} jam ${remMinutes} mnt` : `${hours} jam`;
  }

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;

  if (days < 7) {
    return remHours > 0 ? `${days} hari ${remHours} jam` : `${days} hari`;
  }

  const weeks = Math.floor(days / 7);
  const remDays = days % 7;

  if (weeks < 4) {
    return remDays > 0 ? `${weeks} minggu ${remDays} hari` : `${weeks} minggu`;
  }

  const months = Math.floor(days / 30);
  const remWeeks = Math.floor((days % 30) / 7);

  if (months < 12) {
    return remWeeks > 0 ? `${months} bulan ${remWeeks} minggu` : `${months} bulan`;
  }

  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days % 365) / 30);
  return remMonths > 0 ? `${years} tahun ${remMonths} bulan` : `${years} tahun`;
}

// Helper 6 Hitung status koneksi perangkat IoT berdasarkan waktu terima terakhir.
function getDeviceConnectionStatus(waktuTerima) {
  if (!waktuTerima) {
    return { status: 'OFFLINE', label: 'Offline', diffSeconds: null };
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(waktuTerima).getTime()) / 1000));
  const durationLabel = formatElapsedDuration(diffSeconds);

  if (diffSeconds <= 120) {
    return { status: 'ONLINE',   label: `Online · ${durationLabel} lalu`,   diffSeconds };
  }
  if (diffSeconds <= 500) {
    return { status: 'DELAYED',  label: `Delayed · ${durationLabel} lalu`,  diffSeconds };
  }
  return     { status: 'OFFLINE', label: `Offline · ${durationLabel} lalu`, diffSeconds };
}

/**
 * POST /api/sensor-data
 * Ingestion data telemetri dari mikrokontroler / sensor IoT / simulator
 */
const recordSensorData = async (req, res, next) => {
  try {
    const { payload } = req.body;

    // Validasi panjang Payload
    if (!payload || typeof payload !== 'string' || payload.length !== 20) {
      return res.status(400).json({
        success: false,
        message: "Format payload tidak valid (harus 20 karakter string)",
      });
    }

    // Pemisahan data dan checksum
    const dataString = payload.substring(0, 18);
    const receivedChecksum = payload.substring(18, 20);

    const calculatedChecksum = calculateAdemcoChecksum(dataString);

    if (calculatedChecksum !== receivedChecksum) {
      console.warn(`[SECURITY] Invalid checksum. Expected: ${calculatedChecksum}, Received: ${receivedChecksum}`);
      return res.status(400).json({
        success: false,
        message: "Integritas data gagal diverifikasi (Checksum Mismatch)",
      });
    }

    // Pencocokan data dengan format
    const idModul = dataString.substring(0, 3);
    const targetZonaId = dataString.substring(3, 5);
    const rawVolt = dataString.substring(5, 8);
    const dateStr = dataString.substring(8, 18);

    const zona = await prisma.zona.findUnique({
      where: { kodeZona: targetZonaId },
      include: { modul: true },
    });

    if (!zona) {
      return res.status(404).json({
        success: false,
        message: `Zona dengan ID '${targetZonaId}' tidak ditemukan`,
      });
    }

    // Konversi data
    const voltase = parseFloat(rawVolt) / 100;
    const ketinggian = hitungKetinggianDariVoltase(zona, voltase);
    const waktuRekam = parseIoTDate(dateStr);

    const statusTercatat = calculateWaterStatus(ketinggian, zona);

    // Set data waktu terima sistem
    const waktuTerima = new Date();

    // Simpan data 
    const record = await prisma.sensorData.create({
      data: {
        idZona: zona.id,
        ketinggianAir: ketinggian,
        voltaseRaw: voltase,
        statusTercatat,
        waktuRekam: waktuRekam,
        waktuTerima: waktuTerima,
      },
    });

    // Otomatis buat AlertLog jika status bukan AMAN
    let alertCreated = null;
    if (statusTercatat !== "AMAN") {
      alertCreated = await prisma.alertLog.create({
        data: {
          idZona: zona.id,
          levelStatus: statusTercatat,
          pesanAlert: `Level air pada ${zona.namaZona} (${zona.modul.nama}) mencapai ${ketinggian} ${zona.satuan} — Status: ${statusTercatat}`,
          isResolved: false,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: "Payload valid dan data berhasil dicatat",
      data: {
        id: record.id.toString(),
        statusTercatat: record.statusTercatat,
        checksumVal: calculatedChecksum
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/sensor-data
 * Mengambil histori data sensor (dengan filter zona, rentang tanggal, limit)
 */
const getSensorData = async (req, res, next) => {
  try {
    const { idZona, idModul, status, startDate, endDate, limit = 50, page = 1 } = req.query;

    const where = {};
    if (idZona) {
      where.idZona = idZona;
    } else if (idModul) {
      where.zona = { idModul: idModul };
    }

    if (status && status !== "SEMUA") {
      where.statusTercatat = String(status).toUpperCase();
    }

    if (startDate || endDate) {
      where.waktuTerima = {};
      if (startDate) where.waktuTerima.gte = new Date(startDate);
      if (endDate) {
        // Jika endDate hanya tanggal YYYY-MM-DD, set ke akhir hari
        const endD = new Date(endDate);
        if (endDate.length <= 10) {
          endD.setHours(23, 59, 59, 999);
        }
        where.waktuTerima.lte = endD;
      }
    }

    const take = Math.min(parseInt(limit, 10) || 50, 500);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [total, records] = await Promise.all([
      prisma.sensorData.count({ where }),
      prisma.sensorData.findMany({
        where,
        take,
        skip,
        orderBy: { waktuTerima: "desc" },
        include: {
          zona: {
            select: {
              id: true,
              kodeZona: true,
              namaZona: true,
              tinggiMaks: true,
              satuan: true,
              modul: { select: { id: true, kodeIot: true, nama: true } },
            },
          },
        },
      }),
    ]);

    // Format output (BigInt di-convert ke String)
    const formatted = records.map((r) => {
      const tinggiMaks = r.zona?.tinggiMaks ? Number(r.zona.tinggiMaks) : null;
      const ketinggianAir = Number(r.ketinggianAir);
      const persen = tinggiMaks && tinggiMaks > 0 
        ? Math.min(100, Math.max(0, (ketinggianAir / tinggiMaks) * 100))
        : null;

      return {
        id: r.id.toString(),
        idZona: r.idZona,
        kodeZona: r.zona?.kodeZona || "",
        namaZona: r.zona?.namaZona || "",
        tinggiMaks,
        modulId: r.zona?.modul?.id || "",
        modulKodeIot: r.zona?.modul?.kodeIot || "",
        modulNama: r.zona?.modul?.nama || "",
        satuan: r.zona?.satuan || "cm",
        ketinggianAir,
        persen: persen !== null ? Math.round(persen * 10) / 10 : null,
        voltaseRaw: r.voltaseRaw ? Number(r.voltaseRaw) : null,
        statusTercatat: r.statusTercatat,
        waktuRekam: r.waktuRekam,
        waktuTerima: r.waktuTerima,
      };
    });

    res.status(200).json({
      success: true,
      pagination: {
        total,
        page: parseInt(page, 10) || 1,
        limit: take,
        totalPages: Math.ceil(total / take) || 1,
      },
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/sensor-data/latest
 * Mengambil pembacaan sensor terbaru untuk setiap zona (atau 1 zona tertentu)
 */
const getLatestSensorData = async (req, res, next) => {
  try {
    const { idZona } = req.query;

    if (idZona) {
      const latest = await prisma.sensorData.findFirst({
        where: { idZona },
        orderBy: { waktuTerima: "desc" },
        include: {
          zona: {
            include: { modul: true },
          },
        },
      });

      if (!latest) {
        return res.status(404).json({
          success: false,
          message: `Belum ada data sensor untuk Zona '${idZona}'`,
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          id: latest.id.toString(),
          idZona: latest.idZona,
          namaZona: latest.zona.namaZona,
          modulNama: latest.zona.modul.nama,
          satuan: latest.zona.satuan,
          ketinggianAir: Number(latest.ketinggianAir),
          voltaseRaw: latest.voltaseRaw ? Number(latest.voltaseRaw) : null,
          statusTercatat: latest.statusTercatat,
          waktuRekam: latest.waktuRekam,
          waktuTerima: latest.waktuTerima,
        },
      });
    }

    // Ambil latest untuk semua zona
    const zonas = await prisma.zona.findMany({
      include: {
        modul: true,
        sensorData: {
          orderBy: { waktuTerima: "desc" },
          take: 1,
        },
      },
    });

    const latestPerZona = zonas.map((z) => {
      const r = z.sensorData[0] || null;
      return {
        idZona: z.id,
        namaZona: z.namaZona,
        modulNama: z.modul?.nama,
        satuan: z.satuan,
        thresholds: {
          waspada: Number(z.batasWaspada),
          bahaya: Number(z.batasBahaya),
          kritis: Number(z.batasKritis),
          tinggiMaks: Number(z.tinggiMaks),
        },
        latestReading: r
          ? {
              id: r.id.toString(),
              ketinggianAir: Number(r.ketinggianAir),
              voltaseRaw: r.voltaseRaw ? Number(r.voltaseRaw) : null,
              statusTercatat: r.statusTercatat,
              waktuRekam: r.waktuRekam,
              waktuTerima: r.waktuTerima,
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      count: latestPerZona.length,
      data: latestPerZona,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  recordSensorData,
  getSensorData,
  getLatestSensorData,
};
