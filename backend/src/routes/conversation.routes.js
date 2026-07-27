/**
 * conversation.routes.js
 */
import { Router } from 'express';
import { listConversations, getConversation, deleteConversation } from '../controllers/conversation.controller.js';

const router = Router();

router.get('/',    listConversations);
router.get('/:id', getConversation);
router.delete('/:id', deleteConversation);

export default router;
