import { USER_TYPES } from "../constants/user.js";
import { supabase } from "../config/supabase.js";

const GetAuthUserWithMeta = async (user) => {
  const is_app_admin = user.user_type === USER_TYPES.ADMIN;

  let is_branch_admin = false;
  if (is_app_admin) {
    is_branch_admin = true;
  } else if (user?.id) {
    const { data: adminMemberships } = await supabase
      .from("branch_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_admin", true)
      .eq("is_deleted", false)
      .limit(1);

    is_branch_admin = Boolean(adminMemberships && adminMemberships.length > 0);
  }

  const userObj = typeof user.toObject === "function" ? user.toObject() : user;
  const meta = {
    is_app_admin,
    is_branch_admin,
    is_app_moderator: false,
    is_teacher: false,
  };

  return {
    user: userObj,
    meta,
  };
};

export { GetAuthUserWithMeta };

