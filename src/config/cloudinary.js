const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const uploadToCloudinary = async (filePath, folder, options = {}) => {
  return await cloudinary.uploader.upload(filePath, {
    folder: `linkup/${folder}`,
    ...options,
  });
};

const uploadVideo = async (filePath, folder) => {
  return await cloudinary.uploader.upload(filePath, {
    folder: `linkup/${folder}`,
    resource_type: 'video',
    eager: [{ format: 'mp4', quality: 'auto' }],
    eager_async: true,
  });
};

const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  return await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  });
};

module.exports = { cloudinary, uploadToCloudinary, uploadVideo, deleteFromCloudinary };
