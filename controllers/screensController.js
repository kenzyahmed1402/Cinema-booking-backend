import Screen from "../models/screens.js"
import Cinema from "../models/cinema.js"
import mongoose from "mongoose"

export const createScreen = async (req,res) =>{
    try{
        const {cinema} = req.body;
        if(!mongoose.Types.ObjectId.isValid(cinema)){
            return res.status(400).json("Invalid cinema");
        }
        const cinemaExists = await Cinema.findById(cinema);
        if (!cinemaExists) {
            return res.status(404).json('Cinema not found' );
        }
        const screen = await Screen.create(req.body);
        res.json(screen);
    }catch(error){
        if(error.name === "ValidationError"){
            return res.status(400).json("validation error");
        }
        res.status(500).json("server error")
    }
   
};

export const getScreens = async (req,res)=>{
    try{
        const screens = await Screen.find().populate('cinema');
        res.json(screens);
    }catch(error){
        res.status(500).json("server error");
    }
};

export const getScreenById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json("Invalid Id");
    }
    const screen = await Screen.findById(req.params.id).populate('cinema');
    if (!screen) {
      return res.status(404).json({ message: 'Screen not found' });
    }
    res.json(screen);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateScreen = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json("Invalid Id");
    }

    if (req.body.cinema) {
      if (!mongoose.Types.ObjectId.isValid(req.body.cinema)) {
        return res.status(400).json("Invalid cinema Id");
      }
      const cinemaExists = await Cinema.findById(req.body.cinema);
      if (!cinemaExists) {
        return res.status(404).json("Cinema not found");
      }
    }

    const screen = await Screen.findOneAndUpdate(
      { _id: req.params.id },
      req.body,
      { returnDocument:"after", runValidators: true }
    ).populate('cinema');

    if (!screen) {
      return res.status(404).json("Screen not found");
    }
    res.json(screen);
  } catch (error) {
    if(error.name === "ValidationError"){
        return res.status(400).json("validation error");
    }
    res.status(500).json("Internal server error");
  }
};

export const deleteScreen = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json("Invalid Id");
    }
    const screen = await Screen.findOneAndDelete({ _id: req.params.id });
    if (!screen) {
      return res.status(404).json("Screen not found");
    }
    res.json('Screen deleted successfully');
  } catch (error) {
    res.status(500).json("Internal server error");
  }
};
