const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const KnowledgeBase = require('../models/KnowledgeBase');

const router = express.Router();

// @route   GET /api/knowledge-base
// @desc    Get all knowledge base articles
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    
    let query = { isPublished: true };
    
    if (category) {
      query.category = category;
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    const articles = await KnowledgeBase.find(query)
      .populate('author', 'firstName lastName')
      .sort({ priority: -1, updatedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await KnowledgeBase.countDocuments(query);

    res.json({
      articles,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
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
    const article = await KnowledgeBase.findById(req.params.id)
      .populate('author', 'firstName lastName');
    
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }

    // Increment view count
    article.views += 1;
    article.lastViewed = new Date();
    await article.save();
    
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

    const article = new KnowledgeBase({
      ...req.body,
      author: req.user._id
    });

    await article.save();
    await article.populate('author', 'firstName lastName');

    res.status(201).json(article);
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
    const article = await KnowledgeBase.findById(req.params.id);
    
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }

    // Check permissions
    if (req.user.role !== 'admin' && 
        req.user.role !== 'property-manager' && 
        article.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this article' });
    }

    Object.assign(article, req.body);
    await article.save();
    await article.populate('author', 'firstName lastName');

    res.json(article);
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
    const article = await KnowledgeBase.findById(req.params.id);
    
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }

    // Check permissions
    if (req.user.role !== 'admin' && 
        req.user.role !== 'property-manager' && 
        article.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this article' });
    }

    await article.deleteOne();
    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
