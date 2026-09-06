import { USER_TYPES } from "../constants/user.js";

const GetAuthUserWithMeta = async (user) => {
  return {
    user: typeof user.toObject === "function" ? user.toObject() : user,
    meta: {
      is_app_admin: user.user_type === USER_TYPES.ADMIN,
      is_app_moderator: false,
      is_teacher: false,
    },
  };
};

export { GetAuthUserWithMeta };
