const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const { optionalAuth } = require("../middleware/auth");

const UPLOAD_DIR = path.join(__dirname, "../../uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MIME_TO_EXT = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // Random server-chosen name; the extension comes from the validated MIME type, never from the client filename
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${MIME_TO_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (MIME_TO_EXT[file.mimetype]) return cb(null, true);
    const err = new Error("Only PNG, JPG or WebP images are allowed");
    err.statusCode = 400;
    err.code = "VALIDATION_ERROR";
    cb(err);
  },
});

router.post("/", optionalAuth, (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ success: false, message: "Image must be 5 MB or smaller", code: "VALIDATION_ERROR" });
      return next(err);
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded (field name "image")', code: "VALIDATION_ERROR" });
    res.status(201).json({ success: true, data: { url: `/uploads/${req.file.filename}` } });
  });
});

module.exports = { router, UPLOAD_DIR };
