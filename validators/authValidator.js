import validateRequest from '../middlewares/validateRequest.js';

const registerSchema = {
  name: { required: true, type: 'string' },
  email: { required: true, type: 'email' },
  password: { required: true, type: 'string', minLength: 8 },
};

const loginSchema = {
  email: { required: true, type: 'email' },
  password: { required: true, type: 'string' },
};

export const validateRegister = validateRequest(registerSchema);
export const validateLogin = validateRequest(loginSchema);
