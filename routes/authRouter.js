import express from 'express';
import { register, login, getMe } from '../controllers/authController.js';
import { protect } from '../middlewares/auth.js';
import { authLimiter } from '../middlewares/rateLimit.js';
import { validateRegister, validateLogin } from '../validators/authValidator.js';

const authRouter = express.Router();

authRouter.post('/register', authLimiter, validateRegister, register);
authRouter.post('/login', authLimiter, validateLogin, login);
authRouter.get('/me', protect, getMe);

export default authRouter;
