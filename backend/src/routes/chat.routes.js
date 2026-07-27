/**
 * chat.routes.js
 * POST /api/chat — Send a message and receive a RAG-powered answer
 */

import { Router } from 'express';
import { chat } from '../controllers/chat.controller.js';
import { validateChatRequest } from '../middleware/validation.middleware.js';

const router = Router();

router.post('/', validateChatRequest, chat);

export default router;
