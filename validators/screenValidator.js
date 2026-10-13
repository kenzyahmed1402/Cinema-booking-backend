import validateRequest from "../middlewares/validateRequest.js";

// capacity is not accepted: it's calculated from rows x seatsPerRow
const screenSchema = {
  screenNumber: { required: true, type: "number", min: 1 },
  rows: { required: true, type: "number", min: 1, max: 26 },
  seatsPerRow: { required: true, type: "number", min: 1, max: 99 },
  cinema: { required: true, type: "ObjectId" },
};

export const validateScreen = validateRequest(screenSchema);
export const validateScreenUpdate = validateRequest(screenSchema, { partial: true });
