import Cinema from "../models/cinema.js"
import mongoose from "mongoose"

export const createCinema = async (req,res)=>{
    try{
        const cinema = await Cinema.create(req.body);
        res.json(cinema);
    }catch(error){
        if(error.name === "ValidationError"){
            return res.status(400).json("validation error");
        }
        res.status(500).json("server error")
    }
};

export const getCinemas = async (req,res)=>{
    try{
        const cinemas = await Cinema.find();
        res.json(cinemas);
    }catch(error){
        res.status(500).json("server error")
    }
};

export const getCinemaById = async (req,res)=>{
    try{
        if(!mongoose.Types.ObjectId.isValid(req.params.id)){
            return res.status(400).json("Invalid Id");
        }
        const cinema = await Cinema.findById(req.params.id);
        
        if(!cinema){
            return res.status(404).json("movie not found");
        }
        res.json(cinema);
    }catch(error){
        res.status(500).json("server error")
    }
};

export const updateCinema = async (req,res) =>{
    try{
        if(!mongoose.Types.ObjectId.isValid(req.params.id)){
            return res.status(400).json("Invalid Id");
        }
        const Ucinema = await Cinema.findOneAndUpdate(
            {_id: req.params.id},
            req.body,
            {returnDocument: "after" , runValidators: true}
        )
         if(!Ucinema){
            return res.status(404).json("movie not found");
        }
        res.json(Ucinema);
    }catch(error){
        if(error.name === "ValidationError"){
            return res.status(400).json("validation error");
        }
        res.status(500).json("server error")
        console.log(error);
    }
};

export const deleteCinema = async (req,res) =>{
    try{
        if(!mongoose.Types.ObjectId.isValid(req.params.id)){
            return res.status(400).json("Invalid Id");
        }
        const cinema = await Cinema.findOneAndDelete({_id: req.params.id})
         if(!cinema){
            return res.status(404).json("movie not found");
        }
        res.json(cinema);
    }catch(error){
        res.status(500).json("server error")
    }
};