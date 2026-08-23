import validateRequest from "../middlewares/validateRequest.js";

const screenSchema = {
  screenNumber: { required: true, type: "number", min: 1 },
  capacity: { required: true, type: "number", min: 1 },
  cinema: { required: true, type: "ObjectId" },
};

export const validateScreen = validateRequest(screenSchema);
