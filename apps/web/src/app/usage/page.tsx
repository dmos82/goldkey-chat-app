'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Temporarily removed
// import { Terminal } from 'lucide-react'; // Temporarily removed

// Define the expected data structure from the API
interface UsageData {
  success: boolean;
  usageMonthMarker: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export default function UsagePage() {
  const { token, logout } = useAuth();
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Authentication token not found. Please log in.');
      setIsLoading(false);
      return;
    }

    const fetchUsageData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/users/me/usage`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            logout(); // Automatically log out on auth failure
            throw new Error('Session expired. Please log in again.');
          }
          throw new Error(data.message || `Failed to fetch usage data (${response.status})`);
        }

        if (!data.success) {
          throw new Error(data.message || 'API indicated failure, but returned 2xx status.');
        }

        setUsageData(data);

      } catch (err: any) {
        console.error("Error fetching usage data:", err);
        setError(err.message || 'An unknown error occurred while fetching usage data.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsageData();
  }, [token, logout]); // Rerun if token changes

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">Monthly Usage</h1>
      <p className="text-muted-foreground">
        Track your estimated token usage and cost for the current billing cycle.
      </p>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Current Month Statistics</CardTitle>
          <CardDescription>
            Usage resets at the beginning of each calendar month.
            {usageData?.usageMonthMarker && ` Currently showing data for: ${usageData.usageMonthMarker}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : error ? (
            // <Alert variant="destructive">
            //   <Terminal className="h-4 w-4" />
            //   <AlertTitle>Error Fetching Usage Data</AlertTitle>
            //   <AlertDescription>{error}</AlertDescription>
            // </Alert>
            <p className="text-sm font-medium text-destructive">
              Error Fetching Usage Data: {error}
            </p>
          ) : usageData ? (
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Month:</span>
                <span className="font-medium">{usageData.usageMonthMarker || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prompt Tokens:</span>
                <span className="font-medium">{usageData.promptTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completion Tokens:</span>
                <span className="font-medium">{usageData.completionTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-muted-foreground">Total Tokens:</span>
                <span className="font-medium">{usageData.totalTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t pt-3 mt-2">
                <span className="text-muted-foreground">Estimated Cost:</span>
                <span className="font-medium text-primary">${usageData.estimatedCost.toFixed(6)}</span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No usage data available.</p> // Should not happen if no error and not loading
          )}
        </CardContent>
      </Card>
    </div>
  );
} 