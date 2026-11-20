import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (req, file, callback) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(new Error("Only JPG, PNG and WebP images are allowed"));
    }

    callback(null, true);
  },
});

export default upload;

export function uploadBackgroundImage(req, res, next) {
  upload.single("backgroundImage")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message: error.code === "LIMIT_FILE_SIZE"
          ? "Background image must be 5 MB or smaller"
          : error.message || "Could not process background image upload",
      });
    }
    return next();
  });
}
