import mongoose from "mongoose";

const movieSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
        },
        genre: {
            type: String,
            required: true,
            enum:['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Romance', 'Animation', 'Thriller'],
        },
        duration: {
            type: Number,
            required: true,
            min: 1,
        },
        description: {
        type: String,
        },
        language: {
            type: String,
            default:' English', 
        },
        releaseDate: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

const Movie = mongoose.model('Movie', movieSchema);
export default Movie;