const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images (JPEG, PNG, WebP, GIF) are allowed'), false);
  }
};

const mediaFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'video/mp4', 'video/mov', 'video/avi', 'video/quicktime',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images and videos are allowed'), false);
  }
};

// Upload limits
const uploadAvatar = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('avatar');

const uploadPostMedia = multer({
  storage,
  fileFilter: mediaFilter,
  limits: { fileSize: 100 * 1024 * 1024, files: 10 }, // 100MB, max 10 files
}).array('media', 10);

const uploadSingleMedia = multer({
  storage,
  fileFilter: mediaFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
}).single('media');

const uploadMessageMedia = multer({
  storage,
  fileFilter: mediaFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
}).single('media');

// Wrap to handle multer errors
const handleUpload = (uploadFn) => (req, res, next) => {
  uploadFn(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File too large' });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

module.exports = {
  uploadAvatar: handleUpload(uploadAvatar),
  uploadPostMedia: handleUpload(uploadPostMedia),
  uploadSingleMedia: handleUpload(uploadSingleMedia),
  uploadMessageMedia: handleUpload(uploadMessageMedia),
};
