import Booking from '../models/Booking.js';
import Showtime from '../models/showTime.js';
import mongoose from 'mongoose';

export const createBooking = async (req, res) => {
  try {
    const { showtime, seats } = req.body;

    if (!mongoose.Types.ObjectId.isValid(showtime)) {
      return res.status(400).json("Invalid showtime Id");
    }

    const showtimeDoc = await Showtime.findById(showtime);
    if (!showtimeDoc) {
      return res.status(404).json('Showtime not found');
    }

    const alreadyTaken = seats.filter((seat) => showtimeDoc.bookedSeats.includes(seat));
    if (alreadyTaken.length > 0) {
      return res.status(409).json("Seats already booked")
    }
    const booking = await Booking.create(req.body);

    showtimeDoc.bookedSeats.push(...seats);
    await showtimeDoc.save();

    res.status(201).json(booking);
  } catch (error) {
    if(error.name === "ValidationError"){
        return res.status(400).json("validation error");
    }
    res.status(500).json('Internal server error');
  }
};

export const getBookings = async (req, res) => {
  try {
    const bookings = await Booking.find().populate({
      path: 'showtime',
      populate: [{ path: 'movie' }, { path: 'screen' }],
    });
    res.json(bookings);
  } catch (error) {
    res.status(500).json('Internal server error');
  }
};

export const getBookingById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json('Invalid Id');
    }
    const booking = await Booking.findById(req.params.id).populate({
      path: 'showtime',
      populate: [{ path: 'movie' }, { path: 'screen' }],
    });
    if (!booking) {
      return res.status(404).json('Booking not found');
    }
    res.json(booking);
  } catch (error) {
    res.status(500).json('Internal server error');
  }
};

export const updateBooking = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json('Invalid Id');
    }

    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id },
      req.body,
      { returnDocument:"after", runValidators: true }
    );

    if (!booking) {
      return res.status(404).json('Booking not found');
    }
    res.json(booking);
  } catch (error) {
     if(error.name === "ValidationError"){
        return res.status(400).json("validation error");
    }
    res.status(500).json('Internal server error');
  }
};

export const deleteBooking = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json('Invalid Id');
    }

    const booking = await Booking.findOneAndDelete({ _id: req.params.id });
    if (!booking) {
      return res.status(404).json('Booking not found');
    }

    await Showtime.findOneAndUpdate(booking.showtime, {
      $pull: { bookedSeats: { $in: booking.seats } },
    });

    res.json('Booking deleted successfully');
  } catch (error) {
    res.status(500).json('Internal server error');
  }
};