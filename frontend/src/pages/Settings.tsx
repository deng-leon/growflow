import React from 'react';
import { Alert, Box, CircularProgress, Paper, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';

const Settings: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ha', 'status'],
    queryFn: apiService.getHAStatus,
    refetchInterval: 10_000,
  });

  if (isLoading) return <CircularProgress />;
  if (error) return <Alert severity="error">Unable to load Home Assistant status.</Alert>;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Settings</Typography>
      <Paper sx={{ p: 3, maxWidth: 560 }}>
        <Typography variant="h6" gutterBottom>Home Assistant</Typography>
        <Typography color={data?.status === 'connected' ? 'success.main' : 'warning.main'}>
          {data?.status === 'connected' ? 'Connected' : 'Disconnected'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {data?.configured ? `${data.entities} entities available` : 'No Home Assistant connection configured'}
        </Typography>
      </Paper>
    </Box>
  );
};

export default Settings;