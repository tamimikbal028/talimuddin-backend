import { supabase } from "../config/supabase.js";
import fs from "fs";
import path from "path";

const RemoveLocalFile = (localFilePath) => {
  try {
    if (localFilePath && fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
  } catch (error) {
    console.error("Error removing local file:", error);
  }
};

/**
 * Upload a local file to Supabase Storage
 * @param {string} localFilePath - Path to the local temp file
 * @param {string} bucketName - Supabase Storage bucket name (e.g. 'profile_assets')
 * @param {string} folderName - Folder within the bucket (e.g. 'user-id/avatar')
 * @returns {Promise<{url: string, path: string} | null>}
 */
const UploadToSupabase = async (
  localFilePath,
  bucketName,
  folderName,
  mimetype = undefined
) => {
  try {
    if (!localFilePath) return null;

    const fileName = path.basename(localFilePath);
    const fileBuffer = await fs.promises.readFile(localFilePath);

    // Build destination path inside bucket
    const destinationPath = folderName ? `${folderName}/${fileName}` : fileName;

    const uploadOptions = {
      upsert: true,
    };
    if (mimetype) {
      uploadOptions.contentType = mimetype;
    }

    // Upload to Supabase Storage using admin-level client (bypasses RLS limits on backend)
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(destinationPath, fileBuffer, uploadOptions);

    if (error) {
      throw error;
    }

    // Retrieve public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(bucketName).getPublicUrl(destinationPath);

    // Clean up local temp file
    RemoveLocalFile(localFilePath);

    return {
      url: publicUrl,
      path: destinationPath,
    };
  } catch (error) {
    console.error("Supabase Storage Upload Error:", error);
    // Cleanup local temp file even if upload fails
    RemoveLocalFile(localFilePath);
    throw new Error(error?.message || "Failed to upload file to Supabase");
  }
};

/**
 * Delete a file from Supabase Storage
 * @param {string} bucketName - Supabase Storage bucket name
 * @param {string} filePath - Relative file path inside the bucket
 * @returns {Promise<any | null>}
 */
const DeleteFromSupabase = async (bucketName, filePath) => {
  try {
    if (!filePath) return null;
    const { data, error } = await supabase.storage
      .from(bucketName)
      .remove([filePath]);

    if (error) {
      throw error;
    }
    return data;
  } catch (error) {
    console.error("Supabase Storage Delete Error:", error);
    return null;
  }
};

/**
 * Extract relative file path from a Supabase public URL
 * @param {string} url - Supabase storage public URL
 * @param {string} bucketName - Bucket name
 * @returns {string | null}
 */
const getRelativePathFromUrl = (url, bucketName) => {
  if (!url) return null;
  const searchStr = `/storage/v1/object/public/${bucketName}/`;
  const index = url.indexOf(searchStr);
  if (index !== -1) {
    return url.substring(index + searchStr.length);
  }
  return null;
};

/**
 * Generate a signed URL for a file in a private Supabase Storage bucket
 * @param {string} bucketName - Supabase Storage bucket name
 * @param {string} filePath - Relative file path inside the bucket
 * @param {number} expiresIn - Expiry time in seconds (default: 600 - 10 minutes)
 * @returns {Promise<string>}
 */
const getSignedUrlFromSupabase = async (
  bucketName,
  filePath,
  expiresIn = 600
) => {
  if (!filePath || !bucketName) {
    throw new Error("Missing bucketName or filePath for signed URL generation");
  }

  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(filePath, expiresIn);

  if (error) {
    throw error;
  }

  return data?.signedUrl;
};

export {
  UploadToSupabase,
  DeleteFromSupabase,
  getRelativePathFromUrl,
  getSignedUrlFromSupabase,
};
