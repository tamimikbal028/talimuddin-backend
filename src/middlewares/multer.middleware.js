import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ApiError } from "../utils/ApiError.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempUploadDir = path.join(__dirname, "../../public/temp");

const ensureTempUploadDir = () => {
  fs.mkdirSync(tempUploadDir, { recursive: true });
};

// --- Configuration Constants (all limits in one place) ---
export const UPLOAD_LIMITS = {
  IMAGE: 25 * 1024 * 1024, // 25 MB
  VIDEO: 100 * 1024 * 1024, // 100 MB (for starters, chunking needed later)
  DOC: 50 * 1024 * 1024, // 50 MB (Books or slides)
};

export const ALLOWED_TYPES = {
  IMAGE: /jpeg|jpg|png|webp/,
  VIDEO: /mp4|mkv|webm/,
  DOC: /pdf|doc|docx|ppt|pptx/,
  ARCHIVE: /zip|rar|7z|x-zip-compressed|x-rar-compressed/,
};

// --- Storage Configuration (Common) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      ensureTempUploadDir();
      cb(null, tempUploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const cleanName = file.originalname.replace(/\s+/g, "-");
    cb(null, `${uniqueSuffix}-${cleanName}`);
  },
});

/**
 * Dynamic Uploader Function
 * @param {RegExp} allowedTypes - Which file types are allowed (e.g. ALLOWED_TYPES.IMAGE)
 * @param {Number} maxSize - Max size in bytes (e.g. UPLOAD_LIMITS.IMAGE)
 */
const createUploader = (allowedTypes, maxSize) => {
  return multer({
    storage: storage,
    limits: {
      fileSize: maxSize,
    },
    fileFilter: (req, file, cb) => {
      // 1. Extension check
      const extname = allowedTypes.test(
        path.extname(file.originalname).toLowerCase()
      );
      // 2. Mime type check
      const mimetype = allowedTypes.test(file.mimetype);

      if (extname && mimetype) {
        return cb(null, true);
      } else {
        return cb(
          new ApiError(
            400,
            `Invalid file type! Allowed types matching: ${allowedTypes}`
          ),
          false
        );
      }
    },
  });
};

// --- Exporting separate uploaders for use ---

// 1. Only for Images (Profile, Cover, Post Image)
export const uploadImage = createUploader(
  ALLOWED_TYPES.IMAGE,
  UPLOAD_LIMITS.IMAGE
);

// 2. For Videos (Reels, Course Video)
export const uploadVideo = createUploader(
  ALLOWED_TYPES.VIDEO,
  UPLOAD_LIMITS.VIDEO
);

// 3. For Documents (Teacher Notes, Books)
export const uploadDoc = createUploader(ALLOWED_TYPES.DOC, UPLOAD_LIMITS.DOC);

// 4. Mixed (if ever needed, e.g. image+video together in post)
// The logic might be slightly different, but for now kept it within image limits or you can make others
export const uploadMixed = createUploader(
  /jpeg|jpg|png|webp|mp4|pdf|zip|rar|7z/,
  50 * 1024 * 1024 // 50 MB Max
);

// 5. For Archive files (Box Submission)
export const uploadArchive = createUploader(
  ALLOWED_TYPES.ARCHIVE,
  50 * 1024 * 1024 // 50 MB Max
);

// 6. For any files (Box Submission)
export const uploadAny = createUploader(
  /.*/,
  50 * 1024 * 1024 // 50 MB Max
);

// 7. For Quick Share (500 MB Max)
export const uploadQuickShare = createUploader(/.*/, 500 * 1024 * 1024);
