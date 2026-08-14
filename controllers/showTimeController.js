import Showtime from '../models/showTime.js';
import Movie from '../models/movies.js';
import Screen from '../models/screens.js';
import mongoose from 'mongoose';

export const createShowtime = async (req, res) => {
  try {
    const { movie, screen } = req.body;

    if (!mongoose.Types.ObjectId.isValid(movie)) {
      return res.status(400).json('Invalid movie Id');
    }
    if (!mongoose.Types.ObjectId.isValid(screen)) {
      return res.status(400).json('Invalid screen Id');
    }

    const movieExists = await Movie.findById(movie);
    if (!movieExists) {
      return res.status(404).json('Movie not found');
    }

    const screenExists = await Screen.findById(screen);
    if (!screenExists) {
      return res.status(404).json('Screen not found');
    }

    const showtime = await Showtime.create(req.body);
    res.json(showtime);
  } catch (error) {
    if(error.name === "ValidationError"){
        return res.status(400).json("validation error");
    }
    res.status(500).json('Internal server error');
  }
};

export const getShowtimes = async (req, res) => {
  try {
    const showtimes = await Showtime.find().populate('movie').populate('screen');
    res.json(showtimes);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getShowtimeById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json('Invalid Id');
    }
    const showtime = await Showtime.findById(req.params.id).populate('movie').populate('screen');
    if (!showtime) {
      return res.status(404).json('Showtime not found');
    }
    res.json(showtime);
  } catch (error) {
    res.status(500).json('Internal server error');
  }
};

export const updateShowtime = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json('Invalid Id');
    }

    if (req.body.movie) {
      if (!mongoose.Types.ObjectId.isValid(req.body.movie)) {
        return res.status(400).json('Invalid movie Id');
      }
      const movieExists = await Movie.findById(req.body.movie);
      if (!movieExists) {
        return res.status(404).json('Movie not found');
      }
    }

    if (req.body.screen) {
      if (!mongoose.Types.ObjectId.isValid(req.body.screen)) {
        return res.status(400).json('Invalid screen Id');
      }
      const screenExists = await Screen.findById(req.body.screen);
      if (!screenExists) {
        return res.status(404).json('Screen not found');
      }
    }

    const showtime = await Showtime.findOneAndUpdate(
      { _id: req.params.id },
      req.body,
      { returnDocument: "after", runValidators: true }
    ).populate('movie').populate('screen');

    if (!showtime) {
      return res.status(404).json('Showtime not found');
    }
    res.json(showtime);
  } catch (error) {
    if(error.name === "ValidationError"){
        return res.status(400).json("validation error");
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteShowtime = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json('Invalid Id');
    }
    const showtime = await Showtime.findOneAndDelete({ _id: req.params.id });
    if (!showtime) {
      return res.status(404).json('Showtime not found');
    }
    res.json('Showtime deleted successfully');
  } catch (error) {
    res.status(500).json('Internal server error');
  }
};