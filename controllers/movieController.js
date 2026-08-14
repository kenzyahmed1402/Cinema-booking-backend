import Movie from "../models/movies.js";
import mongoose from "mongoose";

export const createMovie = async (req,res)=>{
    try{
        const movie = await Movie.create(req.body);
        res.json(movie);
    } catch(error){
        if(error.name === "ValidationError"){
            return res.status(400).json("validation error");
        }
        res.status(500).json("server error")
    }
};

export const getMovies = async (req,res)=>{
    try{
        const movies = await Movie.find();
        res.json(movies);
    }catch(error){
        res.status(500).json("server error");
    }
};

export const getMovieById = async (req,res)=>{
    try{
        if(!mongoose.Types.ObjectId.isValid(req.params.id)){
            return res.status(400).json("Invalid Id");
        }
        const movie = await Movie.findById(req.params.id);
        if(!movie){
            return res.status(404).json("movie not found");
        }
        res.json(movie);
    }catch(error){
        res.status(500).json("server error");
    }
};

export const updateMovie = async (req,res)=>{
    try{
        if(!mongoose.Types.ObjectId.isValid(req.params.id)){
            return res.status(400).json("Invalid Id");
        }
        const movie = await Movie.findOneAndUpdate(
            {_id: req.params.id},
            req.body,
            {returnDocument:"after", runValidators: true}
        )
        if(!movie){
            return res.status(404).json("movie not found");
        }
        res.json(movie);
    }catch(error){
        if(error.name === "ValidationError"){
            return res.status(400).json("validation error");
        }
        res.status(500).json("server error")
    }
};

export const deleteMovie = async (req,res)=>{
    try{
        if(!mongoose.Types.ObjectId.isValid(req.params.id)){
            return res.status(400).json("Invalid Id");
        }
        const movie = await Movie.findOneAndDelete({_id:req.params.id});
        if(!movie){
            return res.status(400).json("movie not found");
        }
        res.json(movie);
    }catch(error){
        res.status(500).json("server error");
    }
};
