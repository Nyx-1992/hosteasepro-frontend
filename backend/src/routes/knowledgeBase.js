const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const supabaseKnowledgeBase = require('../services/supabaseKnowledgeBase');

const router = express.Router();

// @route   GET /api/knowledge-base
// @desc    Get all knowledge base articles
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const { data, count, error } = await supabaseKnowledgeBase.listArticles({ category, search, page: Number(page), limit: Number(limit) });
    if (error) throw error;
    res.json({
      articles: data,
      totalPages: Math.ceil((count || 0) / limit),
      currentPage: Number(page),
      total: count || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/knowledge-base/:id
// @desc    Get knowledge base article by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const { data: article, error } = await supabaseKnowledgeBase.getArticleById(req.params.id);
    if (error) throw error;
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    // Optionally increment view count (not atomic, but simple)
    await supabaseKnowledgeBase.updateArticle(req.params.id, { views: (article.views || 0) + 1, last_viewed: new Date().toISOString() });
    res.json(article);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/knowledge-base
// @desc    Create new knowledge base article
// @access  Private (Admin/Property Manager)
router.post('/', auth, authorize('admin', 'property-manager'), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('category').isIn(['procedures', 'troubleshooting', 'maintenance', 'guest-info', 'emergency', 'other'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const article = {
      ...req.body,
      author_id: req.user.id // assumes user.id is the Supabase user id
    };
    const { data, error } = await supabaseKnowledgeBase.createArticle(article);
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/knowledge-base/:id
// @desc    Update knowledge base article
// @access  Private (Admin/Property Manager/Author)
router.put('/:id', auth, async (req, res) => {
  try {
    const { data: article, error: getError } = await supabaseKnowledgeBase.getArticleById(req.params.id);
    if (getError) throw getError;
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    // Check permissions
    if (req.user.role !== 'admin' &&
        req.user.role !== 'property-manager' &&
        article.author_id !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this article' });
    }
    const { data, error } = await supabaseKnowledgeBase.updateArticle(req.params.id, req.body);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/knowledge-base/:id
// @desc    Delete knowledge base article
// @access  Private (Admin/Property Manager/Author)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { data: article, error: getError } = await supabaseKnowledgeBase.getArticleById(req.params.id);
    if (getError) throw getError;
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    // Check permissions
    if (req.user.role !== 'admin' &&
        req.user.role !== 'property-manager' &&
        article.author_id !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this article' });
    }
    const { error } = await supabaseKnowledgeBase.deleteArticle(req.params.id);
    if (error) throw error;
    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
