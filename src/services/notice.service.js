import { supabase } from "../config/supabase.js";
import { ApiError } from "../utils/ApiError.js";
import { getPaginationParams, buildPagination } from "../utils/Pagination.js";

// ==========================================
// 1. GET ALL NOTICES
// ==========================================
const getNoticesService = async (query = {}, isAppAdmin = false) => {
  const { page, limit, from, to } = getPaginationParams(query);
  const search = typeof query.q === "string" ? query.q.trim() : "";

  let queryBuilder = supabase
    .from("notices")
    .select(
      `
      id,
      title,
      content,
      is_pinned,
      is_active,
      is_deleted,
      created_by,
      created_at,
      updated_at,
      author:created_by (
        id,
        full_name,
        user_name,
        avatar
      )
    `,
      { count: "exact" }
    )
    .eq("is_deleted", false);

  // If not App Admin, only active notices are visible
  if (!isAppAdmin) {
    queryBuilder = queryBuilder.eq("is_active", true);
  }

  if (search) {
    queryBuilder = queryBuilder.or(
      `title.ilike.%${search}%,content.ilike.%${search}%`
    );
  }

  queryBuilder = queryBuilder
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const { data: noticeRows, count, error } = await queryBuilder;

  if (error) {
    throw new ApiError(500, `Failed to fetch notices: ${error.message}`);
  }

  const notices = noticeRows || [];
  const pagination = buildPagination(page, limit, count || 0);

  return {
    notices,
    pagination,
  };
};

// ==========================================
// 2. GET SINGLE NOTICE
// ==========================================
const getNoticeByIdService = async (noticeId) => {
  const { data: notice, error } = await supabase
    .from("notices")
    .select(
      `
      id,
      title,
      content,
      is_pinned,
      is_active,
      is_deleted,
      created_by,
      created_at,
      updated_at,
      author:created_by (
        id,
        full_name,
        user_name,
        avatar
      )
    `
    )
    .eq("id", noticeId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, `Failed to retrieve notice: ${error.message}`);
  }

  if (!notice) {
    throw new ApiError(404, "Notice not found");
  }

  return { notice };
};

// ==========================================
// 3. CREATE NOTICE (App Admin only)
// ==========================================
const createNoticeService = async (noticeData, userId) => {
  const insertPayload = {
    title: noticeData.title.trim(),
    content: noticeData.content.trim(),
    is_pinned: Boolean(noticeData.is_pinned),
    is_active:
      noticeData.is_active !== undefined ? Boolean(noticeData.is_active) : true,
    created_by: userId,
  };

  const { data: newNotice, error } = await supabase
    .from("notices")
    .insert([insertPayload])
    .select(
      `
      id,
      title,
      content,
      is_pinned,
      is_active,
      is_deleted,
      created_by,
      created_at,
      updated_at,
      author:created_by (
        id,
        full_name,
        user_name,
        avatar
      )
    `
    )
    .single();

  if (error) {
    throw new ApiError(500, `Failed to create notice: ${error.message}`);
  }

  const notice = newNotice;
  return { notice };
};

// ==========================================
// 4. UPDATE NOTICE (App Admin only)
// ==========================================
const updateNoticeService = async (noticeId, updateData) => {
  const updatePayload = {};

  if (updateData.title !== undefined) {
    updatePayload.title = updateData.title.trim();
  }
  if (updateData.content !== undefined) {
    updatePayload.content = updateData.content.trim();
  }
  if (updateData.is_pinned !== undefined) {
    updatePayload.is_pinned = Boolean(updateData.is_pinned);
  }
  if (updateData.is_active !== undefined) {
    updatePayload.is_active = Boolean(updateData.is_active);
  }

  const { data: updatedNotice, error } = await supabase
    .from("notices")
    .update(updatePayload)
    .eq("id", noticeId)
    .eq("is_deleted", false)
    .select(
      `
      id,
      title,
      content,
      is_pinned,
      is_active,
      is_deleted,
      created_by,
      created_at,
      updated_at,
      author:created_by (
        id,
        full_name,
        user_name,
        avatar
      )
    `
    )
    .single();

  if (error) {
    throw new ApiError(500, `Failed to update notice: ${error.message}`);
  }

  const notice = updatedNotice;
  return { notice };
};

// ==========================================
// 5. DELETE NOTICE (App Admin only - Soft Delete)
// ==========================================
const deleteNoticeService = async (noticeId) => {
  const { error } = await supabase
    .from("notices")
    .update({ is_deleted: true, is_active: false })
    .eq("id", noticeId);

  if (error) {
    throw new ApiError(500, `Failed to delete notice: ${error.message}`);
  }

  const result = { success: true };
  return { result };
};

const noticeServices = {
  getNoticesService,
  getNoticeByIdService,
  createNoticeService,
  updateNoticeService,
  deleteNoticeService,
};

export default noticeServices;
