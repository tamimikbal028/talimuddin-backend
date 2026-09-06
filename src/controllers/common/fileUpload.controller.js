import { AsyncHandler } from "../../utils/AsyncHandler.js";
import fileUploadServices from "../../services/common/fileUpload.service.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

const uploadSingleImage = AsyncHandler(async (req, res) => {
  const fileLocalPath = req.file?.path;

  if (!fileLocalPath) {
    throw new ApiError(400, "No image file uploaded");
  }

  const result = await fileUploadServices.uploadSingleImageService(
    req,
    fileLocalPath
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Image uploaded successfully"));
});

const fileUploadControllers = {
  uploadSingleImage,
};

export default fileUploadControllers;
