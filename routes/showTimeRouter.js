import express from "express";
import { createShowtime, getShowtimes, getShowtimeById, updateShowtime, deleteShowtime } from "../controllers/showTimeController.js";
import { get } from "mongoose";

const STRouter = express.Router();

STRouter.get('/',getShowtimes);
STRouter.get('/:id',getShowtimeById);
STRouter.post('/',createShowtime);
STRouter.put('/:id',updateShowtime);
STRouter.delete('/:id',deleteShowtime);

export default STRouter;