import validateRequest from '../middlewares/validateRequest.js';

// Emails can't be longer than 254 characters (RFC 5321). bcrypt only uses the
// first 72 bytes of a password, so longer ones would be silently cut.
const registerSchema = {
  name: { required: true, type: 'string', maxLength: 100 },
  email: { required: true, type: 'email', maxLength: 254 },
  password: { required: true, type: 'string', minLength: 8, maxBytes: 72 },
};

const loginSchema = {
  email: { required: true, type: 'email', maxLength: 254 },
  password: { required: true, type: 'string' },
};

export const validateRegister = validateRequest(registerSchema);
export const validateLogin = validateRequest(loginSchema);
