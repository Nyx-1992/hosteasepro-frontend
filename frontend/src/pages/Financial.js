import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  TextField,
  MenuItem,
  Tabs,
  Tab,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  AttachMoney,
  Receipt,
  Add,
} from '@mui/icons-material';
import { useQuery } from 'react-query';
import { financialService, propertyService } from '../services/authService';
import { format } from 'date-fns';

const StatCard = ({ title, value, trend, icon, color = 'primary' }) => (
  <Card>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography color="textSecondary" gutterBottom variant="body2">
            {title}
          </Typography>
          <Typography variant="h4" component="h2">
            {value}
          </Typography>
          {trend && (
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
              {trend.direction === 'up' ? (
                <TrendingUp color="success" fontSize="small" />
              ) : (
                <TrendingDown color="error" fontSize="small" />
              )}
              <Typography variant="body2" color={trend.direction === 'up' ? 'success.main' : 'error.main'}>
                {trend.value}%
              </Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ color: `${color}.main` }}>
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const Financial = () => {
  const [tabValue, setTabValue] = useState(0);
  const [filters, setFilters] = useState({
    startDate: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    property: '',
    type: '',
    category: ''
  });

  const { data: properties = [] } = useQuery(
    'properties',
    propertyService.getProperties
  );

  const { data: financialSummary, isLoading: summaryLoading } = useQuery(
    ['financial-summary', filters],
    () => financialService.getSummary(filters),
    { keepPreviousData: true }
  );

  const { data: financialRecords, isLoading: recordsLoading } = useQuery(
    ['financial-records', filters],
    () => financialService.getRecords(filters),
    { keepPreviousData: true }
  );

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  // Calculate summary metrics
  const totalIncome = financialSummary?.summary?.find(s => s._id === 'income')?.total || 0;
  const totalExpenses = financialSummary?.summary?.find(s => s._id === 'expense')?.total || 0;
  const netProfit = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : 0;

  if (summaryLoading) {
    return (
      <Box>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading financial data...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Financial Reports
      </Typography>
      
      <Typography variant="body2" color="textSecondary" paragraph>
        Track income, expenses, and generate reports for your property management business.
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              type="date"
              label="Start Date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              type="date"
              label="End Date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              label="Property"
              value={filters.property}
              onChange={(e) => handleFilterChange('property', e.target.value)}
              fullWidth
              size="small"
            >
              <MenuItem value="">All Properties</MenuItem>
              {properties.map(property => (
                <MenuItem key={property._id} value={property._id}>
                  {property.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              label="Type"
              value={filters.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              fullWidth
              size="small"
            >
              <MenuItem value="">All Types</MenuItem>
              <MenuItem value="income">Income</MenuItem>
              <MenuItem value="expense">Expense</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              label="Category"
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
              fullWidth
              size="small"
            >
              <MenuItem value="">All Categories</MenuItem>
              <MenuItem value="booking-revenue">Booking Revenue</MenuItem>
              <MenuItem value="cleaning-fee">Cleaning Fee</MenuItem>
              <MenuItem value="cleaning">Cleaning</MenuItem>
              <MenuItem value="maintenance">Maintenance</MenuItem>
              <MenuItem value="supplies">Supplies</MenuItem>
              <MenuItem value="utilities">Utilities</MenuItem>
              <MenuItem value="platform-fees">Platform Fees</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Button
              variant="outlined"
              onClick={() => setFilters({
                startDate: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
                endDate: format(new Date(), 'yyyy-MM-dd'),
                property: '',
                type: '',
                category: ''
              })}
              fullWidth
              size="large"
            >
              Reset
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Income"
            value={`R ${totalIncome.toLocaleString()}`}
            icon={<AttachMoney sx={{ fontSize: 40 }} />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Expenses"
            value={`R ${totalExpenses.toLocaleString()}`}
            icon={<Receipt sx={{ fontSize: 40 }} />}
            color="error"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Net Profit"
            value={`R ${netProfit.toLocaleString()}`}
            icon={<TrendingUp sx={{ fontSize: 40 }} />}
            color={netProfit >= 0 ? 'success' : 'error'}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Profit Margin"
            value={`${profitMargin}%`}
            icon={<TrendingUp sx={{ fontSize: 40 }} />}
            color={profitMargin >= 0 ? 'success' : 'error'}
          />
        </Grid>
      </Grid>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label="Financial Records" />
          <Tab label="Category Breakdown" />
          <Tab label="Generate Reports" />
        </Tabs>
      </Box>

      {/* Financial Records Tab */}
      {tabValue === 0 && (
        <Paper>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Financial Records</Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {/* Handle add record */}}
            >
              Add Record
            </Button>
          </Box>
          
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Property</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {financialRecords?.records?.map((record) => (
                  <TableRow key={record._id}>
                    <TableCell>
                      {format(new Date(record.date), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>{record.description}</TableCell>
                    <TableCell>{record.property?.name}</TableCell>
                    <TableCell>
                      <Chip 
                        label={record.category.replace('-', ' ')} 
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={record.type} 
                        size="small"
                        color={record.type === 'income' ? 'success' : 'error'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography 
                        color={record.type === 'income' ? 'success.main' : 'error.main'}
                        fontWeight="bold"
                      >
                        {record.type === 'income' ? '+' : '-'}R {record.amount.toLocaleString()}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {financialRecords?.records?.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="textSecondary">
                No financial records found for the selected period.
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Category Breakdown Tab */}
      {tabValue === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom color="success.main">
                Income by Category
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="right">Count</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {financialSummary?.categoryBreakdown
                    ?.filter(item => item._id.type === 'income')
                    .map((item) => (
                    <TableRow key={`${item._id.type}-${item._id.category}`}>
                      <TableCell>{item._id.category.replace('-', ' ')}</TableCell>
                      <TableCell align="right">R {item.total.toLocaleString()}</TableCell>
                      <TableCell align="right">{item.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom color="error.main">
                Expenses by Category
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="right">Count</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {financialSummary?.categoryBreakdown
                    ?.filter(item => item._id.type === 'expense')
                    .map((item) => (
                    <TableRow key={`${item._id.type}-${item._id.category}`}>
                      <TableCell>{item._id.category.replace('-', ' ')}</TableCell>
                      <TableCell align="right">R {item.total.toLocaleString()}</TableCell>
                      <TableCell align="right">{item.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Generate Reports Tab */}
      {tabValue === 2 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Generate Reports
          </Typography>
          <Typography color="textSecondary" paragraph>
            Generate detailed financial reports for accounting and tax purposes.
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <Button
                variant="outlined"
                fullWidth
                size="large"
                sx={{ py: 2 }}
                onClick={() => {/* Generate income statement */}}
              >
                Income Statement
              </Button>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Button
                variant="outlined"
                fullWidth
                size="large"
                sx={{ py: 2 }}
                onClick={() => {/* Generate expense report */}}
              >
                Expense Report
              </Button>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Button
                variant="outlined"
                fullWidth
                size="large"
                sx={{ py: 2 }}
                onClick={() => {/* Generate tax report */}}
              >
                Tax Report
              </Button>
            </Grid>
          </Grid>
        </Paper>
      )}
    </Box>
  );
};

export default Financial;
