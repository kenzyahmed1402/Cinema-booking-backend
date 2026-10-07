import mongoose from "mongoose";
import AppError from "../utils/AppError.js";

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const validateField = (field, value, rules) => {
  const errors = [];

  if (rules.required && (value === undefined || value === null || value === "")) {
    errors.push(`${field} is required`);
    return errors;
  }

  if (value === undefined || value === null) {
    return errors;
  }

  if (rules.type) {
    if (rules.type === "array" && !Array.isArray(value)) {
      errors.push(`${field} must be an array`);
    } else if (rules.type === "ObjectId" && !mongoose.Types.ObjectId.isValid(value)) {
      errors.push(`${field} must be a valid ObjectId`);
    } else if (rules.type === "email") {
      if (typeof value !== "string" || !isValidEmail(value)) {
        errors.push(`${field} must be a valid email`);
      }
    } else if (rules.type === "date") {
      if (isNaN(Date.parse(value))) {
        errors.push(`${field} must be a valid date`);
      }
    } else if (typeof value !== rules.type && rules.type !== "array" && rules.type !== "ObjectId" && rules.type !== "email" && rules.type !== "date") {
      errors.push(`${field} must be of type ${rules.type}`);
    }
  }

  if (rules.enum && !rules.enum.includes(value)) {
    errors.push(`${field} must be one of ${rules.enum.join(", ")}`);
  }

  if (rules.min !== undefined && value < rules.min) {
    errors.push(`${field} must be at least ${rules.min}`);
  }

  if (rules.max !== undefined && value > rules.max) {
    errors.push(`${field} must be at most ${rules.max}`);
  }

  if (rules.minLength !== undefined && value.length < rules.minLength) {
    errors.push(`${field} must have at least ${rules.minLength} items`);
  }

  if (rules.maxLength !== undefined && value.length > rules.maxLength) {
    errors.push(`${field} must have at most ${rules.maxLength} items`);
  }

  if (rules.pattern && !rules.pattern.test(value)) {
    errors.push(`${field} has an invalid format`);
  }

  if (rules.arrayItemType && Array.isArray(value)) {
    value.forEach((item, index) => {
      if (rules.arrayItemType === "ObjectId" && !mongoose.Types.ObjectId.isValid(item)) {
        errors.push(`${field}[${index}] must be a valid ObjectId`);
      } else if (rules.arrayItemType === "string" && typeof item !== "string") {
        errors.push(`${field}[${index}] must be a string`);
      } else if (rules.arrayItemPattern && !rules.arrayItemPattern.test(item)) {
        errors.push(`${field}[${index}] has an invalid format`);
      }
    });
  }

  return errors;
};

const validateRequest = (schema) => {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      errors.push(...validateField(field, req.body[field], rules));
    }

    if (errors.length > 0) {
      return next(new AppError(errors.join(". "), 400));
    }

    next();
  };
};

export default validateRequest;
