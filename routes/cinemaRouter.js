import express from "express";
import {createCinema , getCinemas , getCinemaById, updateCinema, deleteCinema} from "../controllers/cinemaController.js"
const cinemaRouter = express.Router();

cinemaRouter.get('/', getCinemas);
cinemaRouter.get('/:id', getCinemaById);
cinemaRouter.post('/', createCinema);
cinemaRouter.put('/:id', updateCinema);
cinemaRouter.delete('/:id', deleteCinema);

export default cinemaRouter;