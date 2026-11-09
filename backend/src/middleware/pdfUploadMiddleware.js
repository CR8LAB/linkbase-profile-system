import multer from "multer";

const maxPdfSize = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxPdfSize, files: 1 },
});

export default function uploadPdf(req, res, next) {
  upload.single("pdf")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "PDF must be 5 MB or smaller" });
    }
    return res.status(400).json({ message: "Could not process PDF upload" });
  });
}
