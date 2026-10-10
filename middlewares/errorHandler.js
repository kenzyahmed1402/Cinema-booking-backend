import AppError from '../utils/AppError.js';

const sendErrorDev = (err, original, res) => {
  res.status(err.statusCode || 500).json({
    status: err.status || 'error',
    message: err.message,
    error: original,
    stack: original.stack,
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    console.error('UNEXPECTED ERROR:', err);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong',
    });
  }
};

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldDB = (err) => {
  const fields = Object.keys(err.keyValue ?? {});
  const values = Object.values(err.keyValue ?? {}).map((value) =>
    value instanceof Date ? value.toISOString() : value
  );
  const message = fields.length
    ? `Duplicate value for ${fields.join(', ')}: ${values.join(', ')}. Please use another value.`
    : 'Duplicate field value. Please use another value.';
  return new AppError(message, 409);
};

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again.', 401);

const handleJWTExpiredError = () =>
  new AppError('Your token has expired. Please log in again.', 401);

const handleBadJSON = () =>
  new AppError('Request body is not valid JSON', 400);

// Turns known library errors into AppErrors with the right status code.
// Checks the original error: Mongoose keeps `name` on the prototype, so a
// spread copy ({ ...err }) loses it and these checks would never match.
const normalizeError = (err) => {
  if (err instanceof AppError) return err;
  if (err.name === 'CastError') return handleCastErrorDB(err);
  if (err.name === 'ValidationError') return handleValidationErrorDB(err);
  if (err.code === 11000) return handleDuplicateFieldDB(err);
  if (err.name === 'TokenExpiredError') return handleJWTExpiredError();
  if (err.name === 'JsonWebTokenError') return handleJWTError();
  if (err.type === 'entity.parse.failed') return handleBadJSON();
  return err;
};

const errorHandler = (err, req, res, next) => {
  const error = normalizeError(err);

  if (process.env.NODE_ENV === 'production') {
    sendErrorProd(error, res);
  } else {
    sendErrorDev(error, err, res);
  }
};

export default errorHandler;
