const jwt = require("jsonwebtoken");

// 1. Middleware: Cek apakah user bawa tiket (Login)
const verifyToken = (req, res, next) => {
  // Ambil token dari header "Authorization: Bearer <token>"
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Akses ditolak. Tidak ada token." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Token tidak valid atau kedaluwarsa" });
  }
};

// 2. Middleware: Cek hak akses (RBAC)
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // req.user didapat dari verifyToken di atas
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Akses Ditolak. Role ${req.user.role} tidak berhak.` 
      });
    }
    next();
  };
};

module.exports = { verifyToken, authorizeRoles };