import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Chip,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Fab,
  InputAdornment,
} from '@mui/material';
import {
  Add,
  Search,
  Edit,
  Visibility,
  Delete,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { knowledgeBaseService } from '../services/authService';
import { format } from 'date-fns';
import { useAuth } from '../App';

const ArticleDialog = ({ open, onClose, article = null }) => {
  const [formData, setFormData] = useState(
    article || {
      title: '',
      content: '',
      category: 'procedures',
      tags: [],
      priority: 'medium'
    }
  );

  const queryClient = useQueryClient();
  const { user } = useAuth();

  const createMutation = useMutation(knowledgeBaseService.createArticle, {
    onSuccess: () => {
      queryClient.invalidateQueries('knowledge-base');
      onClose();
    }
  });

  const updateMutation = useMutation(
    (data) => knowledgeBaseService.updateArticle(article._id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('knowledge-base');
        onClose();
      }
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (article) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleTagsChange = (e) => {
    const tags = e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag);
    setFormData(prev => ({ ...prev, tags }));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {article ? 'Edit Article' : 'Create New Article'}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="Title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
                fullWidth
                margin="normal"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                select
                label="Category"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                required
                fullWidth
                margin="normal"
              >
                {['procedures', 'troubleshooting', 'maintenance', 'guest-info', 'emergency', 'other'].map(cat => (
                  <MenuItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                select
                label="Priority"
                value={formData.priority}
                onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                required
                fullWidth
                margin="normal"
              >
                {['low', 'medium', 'high', 'critical'].map(priority => (
                  <MenuItem key={priority} value={priority}>
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Tags (comma separated)"
                value={formData.tags.join(', ')}
                onChange={handleTagsChange}
                fullWidth
                margin="normal"
                placeholder="cleaning, maintenance, guest-communication"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Content"
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                required
                fullWidth
                multiline
                rows={10}
                margin="normal"
                placeholder="Write the article content here..."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button 
            type="submit" 
            variant="contained"
            disabled={createMutation.isLoading || updateMutation.isLoading}
          >
            {article ? 'Update' : 'Create'} Article
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

const ArticleViewDialog = ({ open, onClose, article }) => {
  if (!article) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {article.title}
          <Chip 
            label={article.priority} 
            size="small"
            color={
              article.priority === 'critical' ? 'error' :
              article.priority === 'high' ? 'warning' :
              article.priority === 'medium' ? 'info' : 'default'
            }
          />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="textSecondary">
            Category: {article.category.replace('-', ' ').toUpperCase()}
          </Typography>
          <Typography variant="subtitle2" color="textSecondary">
            Author: {article.author?.firstName} {article.author?.lastName}
          </Typography>
          <Typography variant="subtitle2" color="textSecondary">
            Last Updated: {format(new Date(article.updatedAt), 'PPP')}
          </Typography>
          <Typography variant="subtitle2" color="textSecondary">
            Views: {article.views}
          </Typography>
        </Box>

        {article.tags.length > 0 && (
          <Box sx={{ mb: 2 }}>
            {article.tags.map(tag => (
              <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
            ))}
          </Box>
        )}

        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
          {article.content}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

const KnowledgeBase = () => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [editingArticle, setEditingArticle] = useState(null);

  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: articlesData, isLoading } = useQuery(
    ['knowledge-base', { search, category: categoryFilter }],
    () => knowledgeBaseService.getArticles({ search, category: categoryFilter }),
    { keepPreviousData: true }
  );

  const deleteMutation = useMutation(knowledgeBaseService.deleteArticle, {
    onSuccess: () => {
      queryClient.invalidateQueries('knowledge-base');
    }
  });

  const handleCreate = () => {
    setEditingArticle(null);
    setDialogOpen(true);
  };

  const handleEdit = (article) => {
    setEditingArticle(article);
    setDialogOpen(true);
  };

  const handleView = (article) => {
    setSelectedArticle(article);
    setViewDialogOpen(true);
  };

  const handleDelete = (articleId) => {
    if (window.confirm('Are you sure you want to delete this article?')) {
      deleteMutation.mutate(articleId);
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'emergency': return 'error';
      case 'maintenance': return 'warning';
      case 'procedures': return 'info';
      case 'guest-info': return 'success';
      default: return 'default';
    }
  };

  const canEdit = (article) => {
    return user.role === 'admin' || 
           user.role === 'property-manager' || 
           article.author?._id === user.id;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Knowledge Base</Typography>
      </Box>

      <Typography variant="body2" color="textSecondary" paragraph>
        Centralized repository of procedures, troubleshooting guides, and important information for managing your properties.
      </Typography>

      {/* Search and Filters */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <TextField
            placeholder="Search articles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              )
            }}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            select
            label="Category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            fullWidth
          >
            <MenuItem value="">All Categories</MenuItem>
            <MenuItem value="procedures">Procedures</MenuItem>
            <MenuItem value="troubleshooting">Troubleshooting</MenuItem>
            <MenuItem value="maintenance">Maintenance</MenuItem>
            <MenuItem value="guest-info">Guest Info</MenuItem>
            <MenuItem value="emergency">Emergency</MenuItem>
            <MenuItem value="other">Other</MenuItem>
          </TextField>
        </Grid>
      </Grid>

      {/* Articles List */}
      <Grid container spacing={2}>
        {articlesData?.articles?.map(article => (
          <Grid item xs={12} key={article._id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" gutterBottom>
                      {article.title}
                    </Typography>
                    
                    <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                      <Chip 
                        label={article.category.replace('-', ' ')} 
                        size="small" 
                        color={getCategoryColor(article.category)}
                        variant="outlined"
                      />
                      <Chip 
                        label={article.priority} 
                        size="small"
                        color={
                          article.priority === 'critical' ? 'error' :
                          article.priority === 'high' ? 'warning' :
                          article.priority === 'medium' ? 'info' : 'default'
                        }
                      />
                      <Typography variant="body2" color="textSecondary">
                        {article.views} views
                      </Typography>
                    </Box>

                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      By {article.author?.firstName} {article.author?.lastName} • {format(new Date(article.updatedAt), 'MMM dd, yyyy')}
                    </Typography>

                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {article.content.substring(0, 150)}...
                    </Typography>

                    {article.tags.length > 0 && (
                      <Box>
                        {article.tags.slice(0, 3).map(tag => (
                          <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5 }} />
                        ))}
                        {article.tags.length > 3 && (
                          <Typography variant="caption" color="textSecondary">
                            +{article.tags.length - 3} more
                          </Typography>
                        )}
                      </Box>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, ml: 2 }}>
                    <Button
                      size="small"
                      startIcon={<Visibility />}
                      onClick={() => handleView(article)}
                    >
                      View
                    </Button>
                    
                    {canEdit(article) && (
                      <>
                        <Button
                          size="small"
                          startIcon={<Edit />}
                          onClick={() => handleEdit(article)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          startIcon={<Delete />}
                          color="error"
                          onClick={() => handleDelete(article._id)}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {articlesData?.articles?.length === 0 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="textSecondary">
              No articles found. {(user.role === 'admin' || user.role === 'property-manager') && 'Create your first knowledge base article to get started.'}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Floating Action Button */}
      {(user.role === 'admin' || user.role === 'property-manager') && (
        <Fab
          color="primary"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={handleCreate}
        >
          <Add />
        </Fab>
      )}

      <ArticleDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        article={editingArticle}
      />

      <ArticleViewDialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        article={selectedArticle}
      />
    </Box>
  );
};

export default KnowledgeBase;
