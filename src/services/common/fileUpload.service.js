import { supabase } from "../../config/supabase.js";
import {
  UploadToSupabase,
  DeleteFromSupabase,
  getRelativePathFromUrl,
} from "../../utils/SupabaseStorageUpload.js";
import { ApiError } from "../../utils/ApiError.js";

const UPLOAD_CONFIGS = {
  profile_avatar: {
    tableName: "users",
    columnName: "avatar",
    bucketName: "profile_assets",
    getFolder: (userId) => `${userId}/avatar`,
    getRecordId: (req) => req.user.id,
    authorize: async (req, recordId) => true,
  },
  branch_cover: {
    tableName: "branches",
    columnName: "cover_image",
    bucketName: "branch_assets",
    getFolder: (branchId) => `${branchId}/cover`,
    getRecordId: (req) => req.body.entityId,
    authorize: async (req, recordId) => {
      const { data: branch } = await supabase
        .from("branches")
        .select("id")
        .eq("id", recordId)
        .maybeSingle();
      if (!branch) return false;
      if (req.user.user_type === "ADMIN") return true;
      const { data: member } = await supabase
        .from("branch_memberships")
        .select("is_admin")
        .eq("branch_id", recordId)
        .eq("user_id", req.user.id)
        .eq("status", "JOINED")
        .maybeSingle();
      return !!(member && member.is_admin);
    },
  },
};

const uploadSingleImageService = async (req, fileLocalPath) => {
  const { uploadType } = req.body;
  if (!uploadType || !UPLOAD_CONFIGS[uploadType]) {
    throw new ApiError(400, "Invalid or missing uploadType");
  }

  const config = UPLOAD_CONFIGS[uploadType];
  const recordId = config.getRecordId(req);
  if (!recordId) {
    throw new ApiError(400, "Missing entityId for this uploadType");
  }

  // 1. Authorize user
  const isAuthorized = await config.authorize(req, recordId);
  if (!isAuthorized) {
    throw new ApiError(403, "Permission denied for this asset upload");
  }

  // 2. Fetch current record to delete old image
  const { data: record, error: fetchError } = await supabase
    .from(config.tableName)
    .select(config.columnName)
    .eq("id", recordId)
    .maybeSingle();

  if (fetchError || !record) {
    throw new ApiError(404, "Record not found");
  }

  const oldUrl = record[config.columnName];

  // 3. Upload to Supabase
  let uploadResult;
  try {
    uploadResult = await UploadToSupabase(
      fileLocalPath,
      config.bucketName,
      config.getFolder(recordId)
    );
  } catch (error) {
    throw new ApiError(
      500,
      error?.message || "Error uploading image to storage"
    );
  }

  if (!uploadResult || !uploadResult.url) {
    throw new ApiError(500, "Error uploading image to storage");
  }

  // 4. Update Database
  const { error: updateError } = await supabase
    .from(config.tableName)
    .update({ [config.columnName]: uploadResult.url })
    .eq("id", recordId);

  if (updateError) {
    // Delete newly uploaded file if DB update failed
    const newPath = getRelativePathFromUrl(uploadResult.url, config.bucketName);
    if (newPath) {
      await DeleteFromSupabase(config.bucketName, newPath);
    }
    throw new ApiError(500, "Failed to update record in database");
  }

  // 5. Delete old asset
  if (oldUrl && oldUrl.includes("supabase.co")) {
    const oldPath = getRelativePathFromUrl(oldUrl, config.bucketName);
    if (oldPath) {
      await DeleteFromSupabase(config.bucketName, oldPath);
    }
  }

  return { url: uploadResult.url };
};

const fileUploadServices = {
  uploadSingleImageService,
};

export default fileUploadServices;
