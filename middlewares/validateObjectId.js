import mongoose from 'mongoose';
import AppError from '../utils/AppError.js';

const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!value || !mongoose.Types.ObjectId.isValid(value)) {
      return next(new AppError(`Invalid ${paramName}`, 400));
    }
    next();
  };
};

export default validateObjectId;
