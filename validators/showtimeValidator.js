import validateRequest from "../middlewares/validateRequest.js";

const showtimeSchema = {
  movie: { required: true, type: "ObjectId" },
  screen: { required: true, type: "ObjectId" },
  startTime: { required: true, type: "date" },
  price: { required: true, type: "number", min: 0 },
};

export const validateShowtime = validateRequest(showtimeSchema);
