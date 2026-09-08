import { supabase } from "../config/supabase.js";
import { ApiError } from "../utils/ApiError.js";
import { BRANCH_TYPES } from "../constants/branch.js";
import { USER_TYPES } from "../constants/user.js";
import { getPaginationParams, buildPagination } from "../utils/Pagination.js";

// Helper to map DB branch row to frontend branch structure
const mapBranchRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    location_name: row.location_name || null,
    location_url: row.location_url || null,
    admin_info: Array.isArray(row.admin_info) ? row.admin_info : [],
    cover_image: row.cover_image,
    branch_type: row.branch_type || BRANCH_TYPES.MAIN,
    parent_branch_id: row.parent_branch_id || null,
    is_deleted: row.is_deleted || false,
    members_count: row.members_count || 0,
  };
};

const mapBranchDetailsRow = (row) => {
  if (!row) return null;
  const mapped = mapBranchRow(row);
  return {
    ...mapped,
    parent_branch: row.parent_branch
      ? {
          id: row.parent_branch.id,
          name: row.parent_branch.name,
        }
      : null,
  };
};

// ==========================================
// BRANCH ACTIONS
// ==========================================

// CREATE BRANCH (Admins only)
const createBranchService = async (branchData, userId) => {
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("user_type")
    .eq("id", userId)
    .single();

  if (userError || !user) {
    throw new ApiError(404, "User not found");
  }

  // Only admins can create branches
  if (user.user_type !== "ADMIN") {
    throw new ApiError(403, "Only admins can create branches");
  }

  const branchType =
    branchData.branch_type === BRANCH_TYPES.SUB
      ? BRANCH_TYPES.SUB
      : BRANCH_TYPES.MAIN;

  let parentBranchId = null;

  if (branchType === BRANCH_TYPES.SUB) {
    if (!branchData.parent_branch_id) {
      throw new ApiError(400, "Parent branch is required for sub branch");
    }

    // Verify parent branch exists, is non-deleted, and is a MAIN branch
    const { data: parentBranch, error: parentError } = await supabase
      .from("branches")
      .select("id, name, branch_type, is_deleted")
      .eq("id", branchData.parent_branch_id)
      .maybeSingle();

    if (parentError || !parentBranch || parentBranch.is_deleted) {
      throw new ApiError(400, "Selected main branch does not exist");
    }

    if (parentBranch.branch_type !== BRANCH_TYPES.MAIN) {
      throw new ApiError(400, "Parent branch must be a main branch");
    }

    parentBranchId = parentBranch.id;
  }

  // Create Branch
  const { data: branchRow, error: branchError } = await supabase
    .from("branches")
    .insert({
      name: branchData.name,
      description: branchData.description?.trim() || null,
      location_name: branchData.location_name?.trim() || null,
      location_url: branchData.location_url?.trim() || null,
      admin_info: Array.isArray(branchData.admin_info)
        ? branchData.admin_info
        : [],
      branch_type: branchType,
      parent_branch_id: parentBranchId,
      is_deleted: false,
      members_count: 0,
    })
    .select()
    .single();

  if (branchError || !branchRow) {
    throw new ApiError(500, branchError?.message || "Failed to create branch");
  }

  const branch = mapBranchRow(branchRow);
  return { branch };
};

// JOIN BRANCH (Feature discontinued)
const joinBranchService = async () => {
  throw new ApiError(410, "Join code feature has been removed");
};

// REMOVE MEMBER (App Admin or Branch Admin)
const removeMemberService = async (
  branchId,
  requesterId,
  targetUserId = null,
  targetMemberId = null
) => {
  const { data: branch } = await supabase
    .from("branches")
    .select("id, members_count, is_deleted")
    .eq("id", branchId)
    .maybeSingle();

  if (!branch || branch.is_deleted) throw new ApiError(404, "Branch not found");

  // Check if requester is app admin or branch admin
  const { data: requesterUser } = await supabase
    .from("users")
    .select("user_type")
    .eq("id", requesterId)
    .maybeSingle();

  const isAppAdmin = requesterUser?.user_type === "ADMIN";

  const { data: requesterMembership } = await supabase
    .from("branch_memberships")
    .select("is_admin")
    .eq("branch_id", branchId)
    .eq("user_id", requesterId)
    .maybeSingle();

  const isBranchAdmin = requesterMembership?.is_admin === true;

  if (!isAppAdmin && !isBranchAdmin) {
    throw new ApiError(
      403,
      "Only branch admin or app administrator can remove members"
    );
  }

  let query = supabase
    .from("branch_memberships")
    .select("id, user_id, is_admin")
    .eq("branch_id", branchId);

  if (targetMemberId) {
    query = query.eq("id", targetMemberId);
  } else if (targetUserId) {
    query = query.eq("user_id", targetUserId);
  } else {
    throw new ApiError(400, "Member ID or User ID is required");
  }

  const { data: targetMembership } = await query.maybeSingle();

  if (!targetMembership) {
    throw new ApiError(404, "User is not a member of this branch");
  }

  // Branch Admin cannot remove another Branch Admin (only App Admin can)
  if (!isAppAdmin && targetMembership.is_admin) {
    throw new ApiError(403, "Only app administrators can remove branch admins");
  }

  // Delete membership
  await supabase
    .from("branch_memberships")
    .delete()
    .eq("id", targetMembership.id);

  // Decrement member count if target was a regular member (not admin, not moderator)
  if (!targetMembership.is_admin && !targetMembership.is_moderator) {
    await supabase
      .from("branches")
      .update({ members_count: Math.max(0, (branch.members_count || 1) - 1) })
      .eq("id", branchId);
  }

  return {
    branch_id: branch.id,
    user_id: targetMembership.user_id,
    member_id: targetMembership.id,
  };
};

// DELETE BRANCH (App Admin only)
const deleteBranchService = async (branchId, userId, userType) => {
  const { data: branch } = await supabase
    .from("branches")
    .select("id, is_deleted")
    .eq("id", branchId)
    .maybeSingle();

  if (!branch) {
    throw new ApiError(404, "Branch not found");
  }

  if (branch.is_deleted) {
    throw new ApiError(404, "Branch already deleted");
  }

  let isAppAdmin = userType === USER_TYPES.ADMIN;

  // Fallback check if userType wasn't passed or doesn't match
  if (!isAppAdmin) {
    const { data: user } = await supabase
      .from("users")
      .select("user_type")
      .eq("id", userId)
      .maybeSingle();

    if (user?.user_type === USER_TYPES.ADMIN) {
      isAppAdmin = true;
    }
  }

  if (!isAppAdmin) {
    throw new ApiError(403, "Only app administrator can delete branch");
  }

  // 1. Soft Delete Branch
  await supabase
    .from("branches")
    .update({ is_deleted: true })
    .eq("id", branchId);

  // 2. Soft Delete All Memberships
  await supabase
    .from("branch_memberships")
    .update({ is_deleted: true })
    .eq("branch_id", branchId);

  return { branch_id: branch.id };
};

// UPDATE BRANCH (App Admin or Branch Admin)
const updateBranchService = async (branchId, userId, updateData) => {
  const { data: branch } = await supabase
    .from("branches")
    .select("*")
    .eq("id", branchId)
    .maybeSingle();

  if (!branch || branch.is_deleted) {
    throw new ApiError(404, "Branch not found");
  }

  // Check if user is app admin or branch admin
  const { data: user } = await supabase
    .from("users")
    .select("user_type")
    .eq("id", userId)
    .maybeSingle();

  const isAppAdmin = user?.user_type === "ADMIN";

  const { data: membership } = await supabase
    .from("branch_memberships")
    .select("is_admin")
    .eq("branch_id", branchId)
    .eq("user_id", userId)
    .maybeSingle();

  const isBranchAdmin = membership?.is_admin === true;

  if (!isAppAdmin && !isBranchAdmin) {
    throw new ApiError(
      403,
      "Only branch admin or app administrator can update branch details"
    );
  }

  const updates = {};
  if (updateData.name) updates.name = updateData.name;
  if (updateData.description !== undefined)
    updates.description = updateData.description?.trim() || null;
  if (updateData.location_name !== undefined)
    updates.location_name = updateData.location_name?.trim() || null;
  if (updateData.location_url !== undefined)
    updates.location_url = updateData.location_url?.trim() || null;
  if (updateData.admin_info !== undefined)
    updates.admin_info = Array.isArray(updateData.admin_info)
      ? updateData.admin_info
      : [];
  if (updateData.branch_type) updates.branch_type = updateData.branch_type;
  if (updateData.parent_branch_id !== undefined)
    updates.parent_branch_id = updateData.parent_branch_id;

  const { data: updatedBranch, error: updateError } = await supabase
    .from("branches")
    .update(updates)
    .eq("id", branchId)
    .select()
    .single();

  if (updateError || !updatedBranch) {
    throw new ApiError(500, updateError?.message || "Failed to update branch");
  }

  return { branch: mapBranchRow(updatedBranch) };
};

// ==========================================
// BRANCH SERVICES
// ==========================================

// GET MY BRANCHES
const getMyBranchesService = async (userId, queryParams) => {
  const { page, limit, from, to } = getPaginationParams(queryParams);

  const {
    data: memberships,
    error,
    count,
  } = await supabase
    .from("branch_memberships")
    .select(
      `
      branch:branches!inner(
        id, name, cover_image, is_deleted
      )
    `,
      { count: "exact" }
    )
    .eq("user_id", userId)
    .eq("branch.is_deleted", false)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new ApiError(500, error.message);

  const branches = (memberships || []).map((membership) => {
    const branch = membership.branch;
    return {
      id: branch.id,
      name: branch.name,
      cover_image: branch.cover_image,
    };
  });

  return { branches, pagination: buildPagination(page, limit, count ?? 0) };
};

// GET ALL BRANCHES (All active branches for directory)
const getAllBranchesService = async (queryParams) => {
  const { page, limit, from, to } = getPaginationParams(queryParams);

  const {
    data: branchesData,
    error,
    count,
  } = await supabase
    .from("branches")
    .select(
      `
      id, name, cover_image, is_deleted, branch_type
    `,
      { count: "exact" }
    )
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new ApiError(500, error.message);

  const branches = (branchesData || []).map((branch) => ({
    id: branch.id,
    name: branch.name,
    cover_image: branch.cover_image,
    branch_type: branch.branch_type || BRANCH_TYPES.MAIN,
  }));

  return { branches, pagination: buildPagination(page, limit, count ?? 0) };
};

// SEARCH BRANCHES
const searchBranchesService = async (query) => {
  let builder = supabase
    .from("branches")
    .select(
      `
      id, name, cover_image, is_deleted, branch_type, parent_branch_id
    `
    )
    .eq("is_deleted", false);

  if (query) {
    builder = builder.ilike("name", `%${query}%`);
  }

  const { data: branches, error } = await builder
    .order("name", { ascending: true })
    .limit(50);

  if (error) throw new ApiError(500, error.message);

  const formattedBranches = (branches || []).map((branch) => ({
    id: branch.id,
    name: branch.name,
    cover_image: branch.cover_image,
    branch_type: branch.branch_type || BRANCH_TYPES.MAIN,
  }));

  return { branches: formattedBranches };
};

// GET MAIN BRANCHES (for sub branch creation dropdown)
const getMainBranchesService = async () => {
  const { data: branches, error } = await supabase
    .from("branches")
    .select("id, name")
    .eq("branch_type", BRANCH_TYPES.MAIN)
    .eq("is_deleted", false)
    .order("name", { ascending: true });

  if (error) {
    throw new ApiError(500, error.message || "Failed to fetch main branches");
  }

  return { branches: branches || [] };
};

// GET BRANCH DETAILS
const getBranchDetailsService = async (branchId, userId) => {
  const { data: branchRow, error } = await supabase
    .from("branches")
    .select(
      `
      *,
      parent_branch:parent_branch_id(id, name)
    `
    )
    .eq("id", branchId)
    .maybeSingle();

  if (error || !branchRow) {
    throw new ApiError(404, "Branch not found");
  }

  if (branchRow.is_deleted) {
    throw new ApiError(404, "Branch has been deleted");
  }

  // Check membership if user is authenticated
  let membership = null;
  let user = null;
  let isAdmin = false;
  let isModerator = false;

  if (userId) {
    const { data: membershipData } = await supabase
      .from("branch_memberships")
      .select("*")
      .eq("branch_id", branchId)
      .eq("user_id", userId)
      .maybeSingle();
    membership = membershipData;

    const { data: userData } = await supabase
      .from("users")
      .select("user_type")
      .eq("id", userId)
      .maybeSingle();
    user = userData;

    isAdmin = membership?.is_admin || false;
    isModerator = membership?.is_moderator || false;
  }

  const isAppAdmin = user?.user_type === "ADMIN";
  const canManageFinance = isAdmin || isAppAdmin || isModerator;

  const meta = {
    is_member: !!membership,
    is_admin_user: isAppAdmin,
    is_creator: false,
    is_admin: isAdmin,
    is_moderator: isModerator,
    can_manage_finance: canManageFinance,
  };

  // Get accurate count of regular members (excluding admins and moderators)
  const { count: regularMembersCount } = await supabase
    .from("branch_memberships")
    .select("id", { count: "exact", head: true })
    .eq("branch_id", branchId)
    .eq("is_deleted", false)
    .eq("is_admin", false)
    .eq("is_moderator", false);

  const mappedBranch = mapBranchDetailsRow(branchRow);
  if (regularMembersCount !== null && regularMembersCount !== undefined) {
    mappedBranch.members_count = regularMembersCount;
  }

  return { branch: mappedBranch, meta };
};

// ADD MANUAL MEMBER (App Admin or Branch Admin)
const addMemberService = async (branchId, requesterId, memberData) => {
  const { data: branch, error: branchErr } = await supabase
    .from("branches")
    .select("id, members_count, is_deleted")
    .eq("id", branchId)
    .maybeSingle();

  if (branchErr || !branch || branch.is_deleted) {
    throw new ApiError(404, "Branch not found");
  }

  // Check if requester is app admin or branch admin
  const { data: requesterUser } = await supabase
    .from("users")
    .select("user_type")
    .eq("id", requesterId)
    .maybeSingle();

  const isAppAdmin = requesterUser?.user_type === "ADMIN";

  const { data: requesterMembership } = await supabase
    .from("branch_memberships")
    .select("is_admin")
    .eq("branch_id", branchId)
    .eq("user_id", requesterId)
    .maybeSingle();

  const isBranchAdmin = requesterMembership?.is_admin === true;

  if (!isAppAdmin && !isBranchAdmin) {
    throw new ApiError(
      403,
      "Only branch admins or app administrators can add members"
    );
  }

  const serialNo =
    memberData.serial_no !== undefined &&
    memberData.serial_no !== null &&
    memberData.serial_no !== ""
      ? Number(memberData.serial_no)
      : null;

  const insertPayload = {
    branch_id: branchId,
    user_id: null,
    serial_no: serialNo,
    name: memberData.name.trim(),
    phone: memberData.phone.trim(),
    address: memberData.address?.trim() || null,
    blood_group: memberData.blood_group?.trim() || null,
    email: memberData.email?.trim() || null,
    note: memberData.note?.trim() || null,
    is_admin: false,
    is_deleted: false,
  };

  const { data: newMember, error: insertError } = await supabase
    .from("branch_memberships")
    .insert(insertPayload)
    .select()
    .single();

  if (insertError || !newMember) {
    throw new ApiError(500, insertError?.message || "Failed to add member");
  }

  // Increment member count
  await supabase
    .from("branches")
    .update({ members_count: (branch.members_count || 0) + 1 })
    .eq("id", branchId);

  const formattedMember = {
    id: newMember.id,
    serial_no: newMember.serial_no || null,
    name: newMember.name,
    phone: newMember.phone,
    address: newMember.address,
    blood_group: newMember.blood_group,
    email: newMember.email,
    note: newMember.note,
    user: {
      id: null,
      user_name: null,
      full_name: newMember.name,
      avatar: null,
    },
    meta: {
      user_relation_status: "NONE",
      member_id: newMember.id,
      is_admin: false,
      is_creator: false,
      is_self: false,
      is_manual: true,
      can_manage: true,
      joined_at: newMember.created_at,
    },
  };

  return { member: formattedMember };
};

// UPDATE MEMBER (App Admin or Branch Admin)
const updateMemberService = async (
  branchId,
  requesterId,
  memberId,
  updateData
) => {
  const { data: branch } = await supabase
    .from("branches")
    .select("id, is_deleted")
    .eq("id", branchId)
    .maybeSingle();

  if (!branch || branch.is_deleted) {
    throw new ApiError(404, "Branch not found");
  }

  // Check if requester is app admin or branch admin
  const { data: requesterUser } = await supabase
    .from("users")
    .select("user_type")
    .eq("id", requesterId)
    .maybeSingle();

  const isAppAdmin = requesterUser?.user_type === "ADMIN";

  const { data: requesterMembership } = await supabase
    .from("branch_memberships")
    .select("is_admin")
    .eq("branch_id", branchId)
    .eq("user_id", requesterId)
    .maybeSingle();

  const isBranchAdmin = requesterMembership?.is_admin === true;

  if (!isAppAdmin && !isBranchAdmin) {
    throw new ApiError(
      403,
      "Only branch admin or app administrator can update member details"
    );
  }

  const { data: targetMembership } = await supabase
    .from("branch_memberships")
    .select("*, user:users!user_id(id, full_name, user_name, avatar, email)")
    .eq("id", memberId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (!targetMembership) {
    throw new ApiError(404, "Member not found in this branch");
  }

  const updates = {};
  if (updateData.serial_no !== undefined) {
    updates.serial_no =
      updateData.serial_no !== null && updateData.serial_no !== ""
        ? Number(updateData.serial_no)
        : null;
  }
  if (updateData.name !== undefined) updates.name = updateData.name.trim();
  if (updateData.phone !== undefined)
    updates.phone = updateData.phone ? updateData.phone.trim() : null;
  if (updateData.address !== undefined)
    updates.address = updateData.address ? updateData.address.trim() : null;
  if (updateData.blood_group !== undefined)
    updates.blood_group = updateData.blood_group
      ? updateData.blood_group.trim()
      : null;
  if (updateData.email !== undefined)
    updates.email = updateData.email ? updateData.email.trim() : null;
  if (updateData.note !== undefined)
    updates.note = updateData.note ? updateData.note.trim() : null;

  const { data: updatedMember, error: updateErr } = await supabase
    .from("branch_memberships")
    .update(updates)
    .eq("id", memberId)
    .select("*, user:users!user_id(id, full_name, user_name, avatar, email)")
    .single();

  if (updateErr || !updatedMember) {
    throw new ApiError(500, updateErr?.message || "Failed to update member");
  }

  const u = updatedMember.user;
  const isManual = !updatedMember.user_id;
  const memberName = isManual
    ? updatedMember.name || "Unnamed Member"
    : u?.full_name || updatedMember.name || "Unnamed";

  const formattedMember = {
    id: updatedMember.id,
    serial_no: updatedMember.serial_no || null,
    name: memberName,
    phone: updatedMember.phone,
    address: updatedMember.address,
    blood_group: updatedMember.blood_group,
    email: isManual ? updatedMember.email : u?.email || updatedMember.email,
    note: updatedMember.note,
    user: {
      id: u?.id || null,
      user_name: u?.user_name || null,
      full_name: memberName,
      avatar: u?.avatar || null,
    },
    meta: {
      user_relation_status:
        !isManual && u?.id === requesterId ? "SELF" : "NONE",
      member_id: updatedMember.id,
      is_admin: updatedMember.is_admin,
      is_creator: false,
      is_self: !isManual && u?.id === requesterId,
      is_manual: isManual,
      can_manage: true,
      joined_at: updatedMember.created_at,
    },
  };

  return { member: formattedMember };
};

// GET BRANCH MEMBERS
const getBranchMembersService = async (branchId, userId, queryParams) => {
  const { data: branch } = await supabase
    .from("branches")
    .select("id, is_deleted")
    .eq("id", branchId)
    .maybeSingle();

  if (!branch || branch.is_deleted) throw new ApiError(404, "Branch not found");

  const { data: requesterUser } = await supabase
    .from("users")
    .select("user_type")
    .eq("id", userId)
    .maybeSingle();

  const isAppAdmin = requesterUser?.user_type === "ADMIN";

  // Check membership
  const { data: currentUserMembership } = await supabase
    .from("branch_memberships")
    .select("is_admin")
    .eq("branch_id", branchId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!currentUserMembership && !isAppAdmin) {
    throw new ApiError(403, "You are not a member of this branch");
  }

  const isAdmin = currentUserMembership?.is_admin || false;
  const canManage = isAppAdmin || isAdmin;

  const { page, limit, from, to } = getPaginationParams(queryParams);

  let memberQuery = supabase
    .from("branch_memberships")
    .select(
      `
      id,
      serial_no,
      name,
      phone,
      address,
      blood_group,
      email,
      note,
      is_admin,
      is_moderator,
      created_at,
      user_id,
      user:users!user_id(id, full_name, user_name, avatar, email)
    `,
      { count: "exact" }
    )
    .eq("branch_id", branchId)
    .eq("is_deleted", false)
    .eq("is_admin", false)
    .eq("is_moderator", false);

  if (queryParams?.search) {
    const s = queryParams.search.trim();
    if (!isNaN(Number(s)) && Number(s) > 0) {
      memberQuery = memberQuery.or(
        `name.ilike.%${s}%,phone.ilike.%${s}%,serial_no.eq.${Number(s)}`
      );
    } else {
      memberQuery = memberQuery.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
    }
  }

  const {
    data: memberships,
    count,
    error,
  } = await memberQuery
    .order("serial_no", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .range(from, to);

  if (error) throw new ApiError(500, error.message);

  const members = (memberships || [])
    .map((membership) => {
      const u = membership.user;
      const isManual = !membership.user_id;

      if (membership.is_admin || membership.is_moderator) {
        return null;
      }

      const isSelf = !isManual && u?.id === userId;
      const memberName = isManual
        ? membership.name || "Unnamed Member"
        : u?.full_name || membership.name || "Unnamed";
      const memberPhone = membership.phone || null;

      return {
        id: membership.id,
        serial_no: membership.serial_no || null,
        name: memberName,
        phone: memberPhone,
        address: membership.address || null,
        blood_group: membership.blood_group || null,
        email: isManual
          ? membership.email
          : u?.email || membership.email || null,
        note: membership.note || null,
        user: {
          id: u?.id || null,
          user_name: u?.user_name || null,
          full_name: memberName,
          avatar: u?.avatar || null,
        },
        meta: {
          user_relation_status: isSelf ? "SELF" : "NONE",
          member_id: membership.id,
          is_admin: false,
          is_moderator: Boolean(membership.is_moderator),
          is_creator: false,
          is_self: isSelf,
          is_manual: isManual,
          can_manage: canManage && !isSelf,
          joined_at: membership.created_at,
        },
      };
    })
    .filter(Boolean);

  const meta = {
    is_creator: false,
    is_admin: isAdmin || isAppAdmin,
  };

  return {
    members,
    pagination: buildPagination(page, limit, count ?? 0),
    meta,
  };
};

// SEARCH USERS (App Admin or Branch Admin, for selecting branch roles)
const searchUsersService = async (query, requesterId, branchId = null) => {
  // 1. Verify requester is App Admin or Branch Admin
  const { data: requester, error: reqErr } = await supabase
    .from("users")
    .select("user_type")
    .eq("id", requesterId)
    .maybeSingle();

  const isAppAdmin = requester?.user_type === "ADMIN";

  if (!isAppAdmin) {
    const { data: adminMembership } = await supabase
      .from("branch_memberships")
      .select("id")
      .eq("user_id", requesterId)
      .eq("is_admin", true)
      .eq("is_deleted", false)
      .limit(1)
      .maybeSingle();

    if (!adminMembership) {
      throw new ApiError(
        403,
        "Only branch admins or app administrators can search users to assign roles"
      );
    }
  }

  let builder = supabase
    .from("users")
    .select("id, full_name, user_name, email, avatar, user_type")
    .eq("account_status", "ACTIVE");

  const trimmedQuery = query?.trim();
  if (trimmedQuery) {
    builder = builder.or(
      `user_name.ilike.%${trimmedQuery}%,full_name.ilike.%${trimmedQuery}%,email.ilike.%${trimmedQuery}%`
    );
  }

  const { data: users, error } = await builder
    .order("full_name", { ascending: true })
    .limit(20);

  if (error) {
    throw new ApiError(500, error.message || "Failed to search users");
  }

  const userList = users || [];
  const userIds = userList.map((u) => u.id);

  let branchRoleMap = {};
  if (branchId && userIds.length > 0) {
    const { data: memberships } = await supabase
      .from("branch_memberships")
      .select("user_id, is_admin, is_moderator, is_deleted")
      .eq("branch_id", branchId)
      .in("user_id", userIds)
      .eq("is_deleted", false);

    (memberships || []).forEach((m) => {
      branchRoleMap[m.user_id] = {
        is_admin: m.is_admin === true,
        is_moderator: m.is_moderator === true,
      };
    });
  }

  const mappedUsers = userList.map((u) => ({
    ...u,
    is_app_admin: u.user_type === "ADMIN",
    branch_role: branchRoleMap[u.id] || null,
  }));

  return { users: mappedUsers };
};

// ADD BRANCH ADMIN (App Admin only)
const addBranchAdminService = async (branchId, requesterId, targetUserId) => {
  // 1. Verify requester is App Admin
  const { data: requester, error: reqErr } = await supabase
    .from("users")
    .select("user_type")
    .eq("id", requesterId)
    .maybeSingle();

  if (reqErr || !requester || requester.user_type !== "ADMIN") {
    throw new ApiError(403, "Only app administrators can add branch admins");
  }

  // 2. Verify branch exists and is not deleted
  const { data: branch, error: branchErr } = await supabase
    .from("branches")
    .select("id, name, is_deleted")
    .eq("id", branchId)
    .maybeSingle();

  if (branchErr || !branch || branch.is_deleted) {
    throw new ApiError(404, "Branch not found or has been deleted");
  }

  // 3. Verify target user exists and is active
  const { data: targetUser, error: userErr } = await supabase
    .from("users")
    .select("id, full_name, user_name, email, avatar, account_status, user_type")
    .eq("id", targetUserId)
    .maybeSingle();

  if (userErr || !targetUser || targetUser.account_status !== "ACTIVE") {
    throw new ApiError(404, "Target user not found or inactive");
  }

  // App Admin cannot be added as branch admin
  if (targetUser.user_type === "ADMIN") {
    throw new ApiError(
      400,
      "App administrator cannot be added as a branch admin"
    );
  }

  // 4. Check if membership already exists for this branch and user
  const { data: existingMembership, error: memErr } = await supabase
    .from("branch_memberships")
    .select("id, is_admin, is_deleted")
    .eq("branch_id", branchId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (memErr) {
    throw new ApiError(
      500,
      memErr.message || "Failed to verify membership status"
    );
  }

  if (existingMembership) {
    if (existingMembership.is_admin && !existingMembership.is_deleted) {
      throw new ApiError(400, "This user is already an admin of this branch");
    }

    const wasRegular =
      !existingMembership.is_admin &&
      !existingMembership.is_moderator &&
      !existingMembership.is_deleted;

    // Update existing record to be an active admin
    const { error: updateError } = await supabase
      .from("branch_memberships")
      .update({
        is_admin: true,
        is_moderator: false,
        is_deleted: false,
        name: targetUser.full_name,
        email: targetUser.email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingMembership.id);

    if (updateError) {
      throw new ApiError(
        500,
        updateError.message || "Failed to update member to admin"
      );
    }

    if (wasRegular) {
      await supabase
        .from("branches")
        .update({ members_count: Math.max(0, (branch.members_count || 1) - 1) })
        .eq("id", branchId);
    }
  } else {
    // Insert new membership record as admin
    const { error: insertError } = await supabase
      .from("branch_memberships")
      .insert({
        branch_id: branchId,
        user_id: targetUserId,
        name: targetUser.full_name,
        email: targetUser.email,
        is_admin: true,
        is_deleted: false,
      });

    if (insertError) {
      throw new ApiError(
        500,
        insertError.message || "Failed to add user as branch admin"
      );
    }
  }

  return {
    user: {
      id: targetUser.id,
      full_name: targetUser.full_name,
      user_name: targetUser.user_name,
      email: targetUser.email,
      avatar: targetUser.avatar,
    },
  };
};

// ADD BRANCH MODERATOR (Branch Admin only)
const addBranchModeratorService = async (
  branchId,
  requesterId,
  targetUserId
) => {
  // 1. Verify requester is Branch Admin of this branch (Only Branch Admin, not App Admin)
  const { data: requesterMembership } = await supabase
    .from("branch_memberships")
    .select("is_admin")
    .eq("branch_id", branchId)
    .eq("user_id", requesterId)
    .eq("is_deleted", false)
    .maybeSingle();

  const isBranchAdmin = requesterMembership?.is_admin === true;

  if (!isBranchAdmin) {
    throw new ApiError(
      403,
      "Only branch administrators can add moderators to this branch"
    );
  }

  // 2. Verify branch exists and is not deleted
  const { data: branch, error: branchErr } = await supabase
    .from("branches")
    .select("id, name, is_deleted")
    .eq("id", branchId)
    .maybeSingle();

  if (branchErr || !branch || branch.is_deleted) {
    throw new ApiError(404, "Branch not found or has been deleted");
  }

  // 3. Verify target user exists and is active
  const { data: targetUser, error: userErr } = await supabase
    .from("users")
    .select("id, full_name, user_name, email, avatar, account_status, user_type")
    .eq("id", targetUserId)
    .maybeSingle();

  if (userErr || !targetUser || targetUser.account_status !== "ACTIVE") {
    throw new ApiError(404, "Target user not found or inactive");
  }

  // App Admin cannot be added as branch moderator
  if (targetUser.user_type === "ADMIN") {
    throw new ApiError(
      400,
      "App administrator cannot be added as a branch moderator"
    );
  }

  // 4. Check if membership already exists for this branch and user
  const { data: existingMembership, error: memErr } = await supabase
    .from("branch_memberships")
    .select("id, is_admin, is_moderator, is_deleted")
    .eq("branch_id", branchId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (memErr && memErr.code !== "42703") {
    throw new ApiError(
      500,
      memErr.message || "Failed to verify membership status"
    );
  }

  if (existingMembership) {
    if (existingMembership.is_admin && !existingMembership.is_deleted) {
      throw new ApiError(400, "This user is already an admin of this branch");
    }
    if (existingMembership.is_moderator && !existingMembership.is_deleted) {
      throw new ApiError(
        400,
        "This user is already a moderator of this branch"
      );
    }

    const wasRegular =
      !existingMembership.is_admin &&
      !existingMembership.is_moderator &&
      !existingMembership.is_deleted;

    // Update existing record to be an active moderator
    const { error: updateError } = await supabase
      .from("branch_memberships")
      .update({
        is_moderator: true,
        is_deleted: false,
        name: targetUser.full_name,
        email: targetUser.email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingMembership.id);

    if (updateError) {
      if (updateError.code === "42703") {
        throw new ApiError(
          400,
          "Moderator support requires database migration. Please run migration_add_branch_moderator.sql in Supabase SQL editor."
        );
      }
      throw new ApiError(
        500,
        updateError.message || "Failed to update member to moderator"
      );
    }

    if (wasRegular) {
      await supabase
        .from("branches")
        .update({ members_count: Math.max(0, (branch.members_count || 1) - 1) })
        .eq("id", branchId);
    }
  } else {
    // Insert new membership record as moderator
    const { error: insertError } = await supabase
      .from("branch_memberships")
      .insert({
        branch_id: branchId,
        user_id: targetUserId,
        name: targetUser.full_name,
        email: targetUser.email,
        is_admin: false,
        is_moderator: true,
        is_deleted: false,
      });

    if (insertError) {
      if (insertError.code === "42703") {
        throw new ApiError(
          400,
          "Moderator support requires database migration. Please run migration_add_branch_moderator.sql in Supabase SQL editor."
        );
      }
      throw new ApiError(
        500,
        insertError.message || "Failed to add user as branch moderator"
      );
    }
  }

  const result = {
    user: {
      id: targetUser.id,
      full_name: targetUser.full_name,
      user_name: targetUser.user_name,
      email: targetUser.email,
      avatar: targetUser.avatar,
    },
  };

  return result;
};

// GET BRANCH ADMINS
const getBranchAdminsService = async (branchId) => {
  const { data: branch, error: branchErr } = await supabase
    .from("branches")
    .select("id, is_deleted")
    .eq("id", branchId)
    .maybeSingle();

  if (branchErr || !branch || branch.is_deleted) {
    throw new ApiError(404, "Branch not found or has been deleted");
  }

  const { data: admins, error } = await supabase
    .from("branch_memberships")
    .select(
      `
      id,
      user_id,
      is_admin,
      created_at,
      user:users!user_id(id, full_name, user_name, email, avatar)
    `
    )
    .eq("branch_id", branchId)
    .eq("is_admin", true)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiError(500, error.message || "Failed to fetch branch admins");
  }

  return { admins: admins || [] };
};

// GET BRANCH MODERATORS
const getBranchModeratorsService = async (branchId) => {
  const { data: branch, error: branchErr } = await supabase
    .from("branches")
    .select("id, is_deleted")
    .eq("id", branchId)
    .maybeSingle();

  if (branchErr || !branch || branch.is_deleted) {
    throw new ApiError(404, "Branch not found or has been deleted");
  }

  const { data: moderators, error } = await supabase
    .from("branch_memberships")
    .select(
      `
      id,
      user_id,
      is_moderator,
      created_at,
      user:users!user_id(id, full_name, user_name, email, avatar)
    `
    )
    .eq("branch_id", branchId)
    .eq("is_moderator", true)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "42703") {
      return { moderators: [] };
    }
    throw new ApiError(500, error.message || "Failed to fetch branch moderators");
  }

  return { moderators: moderators || [] };
};

// REMOVE BRANCH ADMIN (App Admin ONLY)
const removeBranchAdminService = async (branchId, requesterId, targetMemberId) => {
  // 1. Verify requester is App Admin
  const { data: requester, error: reqErr } = await supabase
    .from("users")
    .select("user_type")
    .eq("id", requesterId)
    .maybeSingle();

  if (reqErr || !requester || requester.user_type !== "ADMIN") {
    throw new ApiError(403, "Only app administrators can remove branch admins");
  }

  // 2. Find target membership
  const { data: targetMembership, error: targetErr } = await supabase
    .from("branch_memberships")
    .select("id, user_id, is_admin, is_deleted")
    .eq("id", targetMemberId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (targetErr || !targetMembership || targetMembership.is_deleted || !targetMembership.is_admin) {
    throw new ApiError(404, "Branch admin not found in this branch");
  }

  // 3. Delete membership
  const { error: delErr } = await supabase
    .from("branch_memberships")
    .delete()
    .eq("id", targetMembership.id);

  if (delErr) {
    throw new ApiError(500, delErr.message || "Failed to remove branch admin");
  }

  return { member_id: targetMembership.id, user_id: targetMembership.user_id };
};

// REMOVE BRANCH MODERATOR (Branch Admin ONLY)
const removeBranchModeratorService = async (
  branchId,
  requesterId,
  targetMemberId
) => {
  // 1. Verify requester is Branch Admin of this branch (Only Branch Admin, not App Admin)
  const { data: requesterMembership } = await supabase
    .from("branch_memberships")
    .select("is_admin")
    .eq("branch_id", branchId)
    .eq("user_id", requesterId)
    .eq("is_deleted", false)
    .maybeSingle();

  const isBranchAdmin = requesterMembership?.is_admin === true;

  if (!isBranchAdmin) {
    throw new ApiError(
      403,
      "Only branch administrators can remove moderators from this branch"
    );
  }

  // 2. Find target membership
  const { data: targetMembership, error: targetErr } = await supabase
    .from("branch_memberships")
    .select("id, user_id, is_moderator, is_deleted")
    .eq("id", targetMemberId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (
    targetErr ||
    !targetMembership ||
    targetMembership.is_deleted ||
    !targetMembership.is_moderator
  ) {
    throw new ApiError(404, "Branch moderator not found in this branch");
  }

  // 3. Delete membership
  const { error: delErr } = await supabase
    .from("branch_memberships")
    .delete()
    .eq("id", targetMembership.id);

  if (delErr) {
    throw new ApiError(
      500,
      delErr.message || "Failed to remove branch moderator"
    );
  }

  return { member_id: targetMembership.id, user_id: targetMembership.user_id };
};

const branchServices = {
  // Branch Actions
  createBranchService,
  joinBranchService,
  removeMemberService,
  deleteBranchService,
  updateBranchService,
  addMemberService,
  updateMemberService,
  addBranchAdminService,
  addBranchModeratorService,
  getBranchAdminsService,
  getBranchModeratorsService,
  removeBranchAdminService,
  removeBranchModeratorService,

  // Branch Info & Lists
  getMyBranchesService,
  getAllBranchesService,
  getMainBranchesService,
  getBranchDetailsService,
  searchBranchesService,
  searchUsersService,

  // Branch Members
  getBranchMembersService,
};

export default branchServices;
