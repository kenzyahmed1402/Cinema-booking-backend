import validateRequest from "../middlewares/validateRequest.js";

const cinemaSchema = {
  name: { required: true, type: "string" },
  location: { required: true, type: "string" },
};

export const validateCinema = validateRequest(cinemaSchema);
export const validateCinemaUpdate = validateRequest(cinemaSchema, { partial: true });
