import express from 'express';
import { register, login, logout, getMe, continueAsGuest, upgrade } from '../controllers/authController.js';
import { protect } from '../middlewares/auth.js';
import { authLimiter, guestLimiter } from '../middlewares/rateLimit.js';
import { validateRegister, validateLogin } from '../validators/authValidator.js';

const authRouter = express.Router();

authRouter.post('/register', authLimiter, validateRegister, register);
authRouter.post('/login', authLimiter, validateLogin, login);
authRouter.post('/guest', guestLimiter, continueAsGuest);
authRouter.post('/upgrade', protect, validateRegister, upgrade);
authRouter.post('/logout', logout);
authRouter.get('/me', protect, getMe);

export default authRouter;
