'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import Link from 'next/link';
import { Home } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label";
import { API_BASE_URL } from '@/lib/config';

// Define Document Type
interface SystemKbDocument {
  _id: string;
  originalFileName: string;
  fileSize: number;
  uploadTimestamp: string;
}

// Define User Type for frontend display
interface AdminUser {
  _id: string;
  username: string;
  role: string;
  createdAt: string;
  // Add other non-sensitive fields as needed
}

// NEW: Define Usage Data Type
interface AdminUsageData {
  _id: string; // User ID
  username: string;
  role: string;
  usageMonthMarker?: string | null;
  currentMonthPromptTokens?: number;
  currentMonthCompletionTokens?: number;
  currentMonthCost?: number;
  totalTokens?: number; // Added in API response
}

// Helper function to format bytes
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading, token } = useAuth();
  const isAuthenticated = !isLoading && !!user;

  const [documents, setDocuments] = useState<SystemKbDocument[]>([]);
  const [isDocsLoading, setIsDocsLoading] = useState<boolean>(true);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // --- State for User Management ---
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState<boolean>(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  // --- State for Delete User Dialog ---
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState<boolean>(false); // Loading state for delete button

  // --- State for Change Password Dialog ---
  const [isChangePasswordDialogOpen, setIsChangePasswordDialogOpen] = useState<boolean>(false);
  const [userToUpdate, setUserToUpdate] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState<boolean>(false);

  // --- State for Deleting All System Documents ---
  const [isDeletingAllSystemDocs, setIsDeletingAllSystemDocs] = useState(false);

  // --- NEW: State for User Usage Tab ---
  const [userUsageData, setUserUsageData] = useState<AdminUsageData[]>([]);
  const [isUsageLoading, setIsUsageLoading] = useState<boolean>(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  // --- Document Fetching Logic (Refactored to standalone function) --- 
  const fetchDocuments = useCallback(async () => {
    // Ensure user is admin and token exists before fetching
    if (!isAuthenticated || user?.role !== 'admin' || !token) {
      console.log('Skipping document fetch: User not admin or token missing.');
      setIsDocsLoading(false);
      setDocuments([]);
      return;
    }
    console.log('Fetching System KB documents...');
    setIsDocsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/system-kb/documents`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        console.error(`Error fetching documents: ${response.status} ${response.statusText}`);
        const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response.' }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }
      const responseData = await response.json(); // Get the full response object
      console.log('Fetched documents response:', responseData);
      if (responseData.success && Array.isArray(responseData.documents)) {
        setDocuments(responseData.documents); // Set the documents array to state
      } else {
        console.error('Invalid data structure received:', responseData);
        throw new Error(responseData.message || 'Invalid data structure received from API.');
      }
    } catch (error: any) {
      console.error('Failed to fetch documents:', error);
      toast({
        title: 'Error Fetching Documents',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      setDocuments([]);
    } finally {
      setIsDocsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, isAuthenticated, toast]);

  // useEffect hook for initial document fetch - Now calls the standalone function
  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role === 'admin') {
      fetchDocuments();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDocuments, isLoading, isAuthenticated, user]); // Depend on fetchDocuments and auth state

  useEffect(() => {
    // DETAILED DEBUG LOGGING:
    console.log(
      `Admin Page Auth Effect Check: isLoading=${isLoading}, isAuthenticated=${isAuthenticated}, user=`,
       user ? JSON.stringify(user) : 'null' // Log user object if it exists
    );

    // Condition relies only on isLoading and user object
    if (!isLoading && (!isAuthenticated || user?.role !== 'admin')) {
      // Log *why* the redirect is happening
      console.log(
        `Redirect Triggered: isLoading=${isLoading}, userExists=${!!user}, userRole=${user?.role}`
      );
      console.log('Redirecting non-admin user...');
      toast({
        title: 'Unauthorized',
        description: 'Redirecting to homepage...',
        variant: 'destructive',
      });
      router.push('/');
    } else if (!isLoading && isAuthenticated && user?.role === 'admin') {
      // Log when access is correctly granted
      console.log('Admin Access Granted.');
    }
    // Removed isAuthenticated from dependencies as it's derived
  }, [isLoading, user, router, toast]);

  // --- User Fetching Logic ---
  const fetchUsers = useCallback(async () => {
    if (!isAuthenticated || user?.role !== 'admin' || !token) {
      console.log('Skipping user fetch: User not admin or token missing.');
      setUsers([]);
      return;
    }
    console.log('Fetching users...');
    setIsUsersLoading(true);
    setUsersError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response.' }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }
      const responseData = await response.json();
      if (responseData.success && Array.isArray(responseData.users)) {
        setUsers(responseData.users);
      } else {
        throw new Error(responseData.message || 'Invalid user data structure received.');
      }
    } catch (error: any) {
      console.error('Failed to fetch users:', error);
      toast({ title: 'Error Fetching Users', description: error.message, variant: 'destructive' });
      setUsersError(error.message);
      setUsers([]);
    } finally {
      setIsUsersLoading(false);
    }
  }, [token, user, isAuthenticated, toast]);

  // --- NEW: Usage Fetching Logic ---
  const fetchUserUsage = useCallback(async () => {
    if (!isAuthenticated || user?.role !== 'admin' || !token) {
      console.log('Skipping usage fetch: User not admin or token missing.');
      setUserUsageData([]);
      return;
    }
    console.log('Fetching user usage data...');
    setIsUsageLoading(true);
    setUsageError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/usage`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response.' }));
        if (response.status === 403) {
            throw new Error(errorData.message || 'Forbidden: Admin access required.');
        }
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }
      const responseData = await response.json();
      if (responseData.success && Array.isArray(responseData.usersUsage)) {
        setUserUsageData(responseData.usersUsage);
      } else {
        throw new Error(responseData.message || 'Invalid user usage data structure received.');
      }
    } catch (error: any) {
      console.error('Failed to fetch user usage data:', error);
      toast({ title: 'Error Fetching Usage Data', description: error.message, variant: 'destructive' });
      setUsageError(error.message);
      setUserUsageData([]);
    } finally {
      setIsUsageLoading(false);
    }
  }, [token, user, isAuthenticated, toast]);

  // --- Trigger data fetch based on active tab ---
  const handleTabChange = (value: string) => {
    if (value === 'users' && users.length === 0) { // Fetch users only if tab is selected and not already loaded
      fetchUsers();
    } else if (value === 'documents' && documents.length === 0) {
      fetchDocuments(); // Fetch documents if selected and not loaded (already handled by initial useEffect)
    } else if (value === 'usage' && userUsageData.length === 0) { // Fetch usage data
        fetchUserUsage();
    }
    // Add logic for other tabs if needed
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!window.confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return;
    }

    console.log(`[Admin Delete] Attempting to delete document: ${docId}`);

    if (!token) {
      toast({ title: 'Error', description: 'Authentication token not found.', variant: 'destructive' });
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/system-kb/documents/${docId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        console.log(`[Admin Delete] Document ${docId} deleted successfully. Response:`, result);
        toast({ 
          title: 'Success', 
          description: result?.message || 'Document deleted successfully.'
        });
        setDocuments(currentDocs => currentDocs.filter(doc => doc._id !== docId));
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response.' }));
        console.error(`[Admin Delete] Error deleting document ${docId}: ${response.status}`, errorData);
        toast({ 
          title: 'Error Deleting Document', 
          description: errorData.message || `Failed to delete document (Status: ${response.status})`,
          variant: 'destructive' 
        });
      }
    } catch (error: any) {      
      console.error(`[Admin Delete] Network or other error deleting document ${docId}:`, error);
      toast({ 
        title: 'Error', 
        description: error.message || 'An unexpected error occurred during deletion.',
        variant: 'destructive' 
      });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setUploadProgress(null);
    if (event.target.files && event.target.files.length > 0) {
      const files = event.target.files;
      const validFiles: File[] = [];
      const errors: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 10 * 1024 * 1024) {
          errors.push(`${file.name}: File is too large (Max 10MB).`);
          continue;
        }
        if (file.type !== 'application/pdf' && file.type !== 'text/plain') {
          errors.push(`${file.name}: Invalid file type (Only PDF/TXT allowed).`);
          continue;
        }
        validFiles.push(file);
      }

      if (errors.length > 0) {
        setUploadError(errors.join('\n'));
        setSelectedFiles(validFiles.length > 0 ? createFileList(validFiles) : null);
        event.target.value = '';
      } else {
        setSelectedFiles(files);
      }

    } else {
      setSelectedFiles(null);
    }
  };

  const createFileList = (files: File[]): FileList => {
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    return dataTransfer.files;
  };

  const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      setUploadError('Please select one or more files to upload.');
      return;
    }
    if (!token) {
      toast({ title: 'Error', description: 'Authentication token not found.', variant: 'destructive' });
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(`Starting upload of ${selectedFiles.length} file(s)...`);

    let successCount = 0;
    let errorCount = 0;
    const uploadErrors: string[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setUploadProgress(`Uploading file ${i + 1} of ${selectedFiles.length}: ${file.name}...`);
      console.log(`[Admin Upload] Attempting to upload file: ${file.name}`);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/system-kb/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });

        const result = await response.json();

        if (response.ok && result.success) {
          console.log(`[Admin Upload] File ${file.name} uploaded successfully. Response:`, result);
          toast({ 
            title: 'Upload Success',
            description: `${file.name}: ${result.message || 'File uploaded successfully.'}`,
          });
          successCount++;
        } else {
          console.error(`[Admin Upload] Error uploading file ${file.name}: ${response.status}`, result);
          const errorMsg = `${file.name}: ${result.message || 'Failed to upload file.'}`;
          uploadErrors.push(errorMsg);
          errorCount++;
          toast({ 
            title: 'Upload Failed',
            description: errorMsg,
            variant: 'destructive' 
          });
        }
      } catch (error: any) {
        console.error(`[Admin Upload] Network or other error uploading ${file.name}:`, error);
        const errorMsg = `${file.name}: ${error.message || 'An unexpected network error occurred.'}`;
        uploadErrors.push(errorMsg);
        errorCount++;
        toast({ 
          title: 'Upload Error',
          description: errorMsg,
          variant: 'destructive' 
        });
      }
    }

    setIsUploading(false);
    setUploadProgress(null);

    if (errorCount > 0) {
      setUploadError(`Upload complete with ${errorCount} error(s). See details above or in console.`);
    } else {
      setUploadError(null);
    }

    setSelectedFiles(null);
    const fileInput = document.getElementById('system-kb-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';

    if (successCount > 0) {
      await fetchDocuments();
    }
  };

  // --- Delete User Handlers ---
  const openDeleteUserConfirm = (userObj: AdminUser) => {
    console.log(`[Admin Users] openDeleteUserConfirm called for user: ${userObj.username}`);
    setUserToDelete(userObj);
    setIsDeleteDialogOpen(true);
    console.log('[Admin Users] setIsDeleteDialogOpen set to true. User to delete:', userObj);
  };

  const closeDeleteUserConfirm = () => {
    setUserToDelete(null);
    setIsDeleteDialogOpen(false);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete || !token) {
      toast({ title: 'Error', description: 'Cannot delete user. User data or token missing.', variant: 'destructive' });
      return;
    }
    
    setIsDeletingUser(true); // Set loading state
    console.log(`[Admin Users] Attempting to delete user: ${userToDelete.username} (ID: ${userToDelete._id})`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${userToDelete._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const result = await response.json(); // Attempt to parse JSON regardless of status

      if (response.ok && result.success) {
        console.log(`[Admin Users] Successfully deleted user: ${userToDelete.username}`);
        toast({ title: 'Success', description: result.message || 'User deleted successfully.' });
        fetchUsers(); // Refresh the user list
        closeDeleteUserConfirm(); // Close the dialog
      } else {
        console.error(`[Admin Users] Error deleting user ${userToDelete.username}: ${response.status}`, result);
        toast({ 
          title: 'Error Deleting User', 
          description: result.message || `Failed to delete user (Status: ${response.status})`,
          variant: 'destructive' 
        });
        // Keep dialog open on error?
        // closeDeleteUserConfirm(); 
      }
    } catch (error: any) {
      console.error(`[Admin Users] Network or other error deleting user ${userToDelete.username}:`, error);
      toast({ 
        title: 'Error', 
        description: error.message || 'An unexpected error occurred during deletion.',
        variant: 'destructive' 
      });
      // Keep dialog open on error?
      // closeDeleteUserConfirm();
    } finally {
      setIsDeletingUser(false); // Reset loading state
    }
  };

  // --- Change Password Handlers ---
  const openChangePasswordDialog = (userObj: AdminUser) => {
    setUserToUpdate(userObj);
    setNewPassword(''); // Clear fields on open
    setConfirmPassword('');
    setPasswordChangeError(null);
    setIsChangePasswordDialogOpen(true);
  };

  const closeChangePasswordDialog = () => {
    setUserToUpdate(null);
    setIsChangePasswordDialogOpen(false);
    setNewPassword(''); 
    setConfirmPassword('');
    setPasswordChangeError(null);
  };

  const handleChangePassword = async () => {
    if (!userToUpdate || !token) {
      setPasswordChangeError('Cannot update password. User data or token missing.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordChangeError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordChangeError('Passwords do not match.');
      return;
    }
    
    setPasswordChangeError(null);
    setIsUpdatingPassword(true);
    console.log(`[Admin Users] Attempting to change password for user: ${userToUpdate.username} (ID: ${userToUpdate._id})`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${userToUpdate._id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword: newPassword }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log(`[Admin Users] Successfully changed password for user: ${userToUpdate.username}`);
        toast({ title: 'Success', description: result.message || 'User password updated successfully.' });
        closeChangePasswordDialog(); // Close the dialog on success
      } else {
        console.error(`[Admin Users] Error changing password for ${userToUpdate.username}: ${response.status}`, result);
        setPasswordChangeError(result.message || `Failed to change password (Status: ${response.status})`);
        // Keep dialog open on error
      }
    } catch (error: any) {
      console.error(`[Admin Users] Network or other error changing password for ${userToUpdate.username}:`, error);
      setPasswordChangeError(error.message || 'An unexpected network error occurred.');
      // Keep dialog open on error
    } finally {
      setIsUpdatingPassword(false); 
    }
  };

  // --- Handler for Deleting ALL System KB Documents ---
  const handleDeleteAllSystemDocuments = async () => {
    if (!token || user?.role !== 'admin') {
      toast({ variant: "destructive", title: "Error", description: "Unauthorized or missing token." });
      return;
    }
    setIsDeletingAllSystemDocs(true);
    console.log('[Admin Delete All System Docs] Initiating deletion...');

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/system-kb/all`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const result = await response.json(); // Assume backend sends JSON response

      if (!response.ok) {
        throw new Error(result.message || `Failed to delete documents (${response.status})`);
      }

      console.log('[Admin Delete All System Docs] Success:', result);
      toast({ title: "Success", description: result.message || "All System KB documents deleted." });
      // Refresh the document list by calling fetchDocuments
      fetchDocuments(); 

    } catch (error: any) {
      console.error('[Admin Delete All System Docs] Error:', error);
      toast({ 
        variant: "destructive", 
        title: "Error Deleting System KB", 
        description: error.message || "An unknown error occurred."
      });
    } finally {
      setIsDeletingAllSystemDocs(false);
      // Optionally close the dialog if needed, but AlertDialog usually handles this
    }
  };
  // --- End Delete All System KB Handler ---

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Verifying access...</span>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') {
    return <div className="flex h-screen items-center justify-center">Access Denied or Redirecting...</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <Link href="/" passHref>
          <Button 
            variant="outline"
            className="transition-all duration-200 ease-in-out hover:bg-muted hover:scale-[1.02] active:scale-[0.98]"
          >
            <Home className="mr-2 h-4 w-4" /> Back to Chat
          </Button>
        </Link>
      </div>
      
      <p className="mb-6">Welcome, {user.username}!</p>
      
      <Tabs defaultValue="overview" className="w-full" onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="usage">Usage Statistics</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview">
          <p>Overview placeholder.</p>
        </TabsContent>
        
        <TabsContent value="documents">
          <h2 className="text-2xl font-semibold mb-4">System KB Documents</h2>
          
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3 text-text-primary-light dark:text-text-primary-dark">Upload New System Document</h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
              <Input 
                id="system-kb-file-input"
                type="file" 
                multiple 
                onChange={handleFileChange} 
                className="flex-grow file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-light/10 dark:file:bg-primary-dark/20 file:text-primary-light dark:file:text-primary-dark hover:file:bg-primary-light/20 dark:hover:file:bg-primary-dark/30 cursor-pointer border-border-light dark:border-border-dark bg-input-light dark:bg-input-dark text-text-primary-light dark:text-text-primary-dark"
                accept=".pdf,.txt"
              />
              <Button 
                onClick={handleUpload} 
                disabled={!selectedFiles || selectedFiles.length === 0 || isUploading}
                className="w-full sm:w-auto"
              >
                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Upload
              </Button>
            </div>
            {/* Display selected file names */}
            {selectedFiles && selectedFiles.length > 0 && (
              <div className="mt-3 text-sm text-text-secondary-light dark:text-text-secondary-dark">
                <p className="font-medium">Selected ({selectedFiles.length}):</p>
                <ul className="list-disc list-inside max-h-24 overflow-y-auto">
                  {Array.from(selectedFiles).map((file, index) => (
                    <li key={index} className="truncate">{file.name}</li>
                  ))}
                </ul>
              </div>
            )}
            {uploadProgress && (
              <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">{uploadProgress}</p>
            )}
            {uploadError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">{uploadError}</p>
            )}
          </div>

          {/* Delete All Button & Dialog */}
          <div className="bg-card dark:bg-card border border-border rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">Manage System KB</h3>
            <AlertDialog>
                <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isDeletingAllSystemDocs}>
                    <Trash2 className="mr-2 h-4 w-4" /> 
                    {isDeletingAllSystemDocs ? 'Deleting...' : 'Delete All System Documents'}
                </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm System KB Deletion</AlertDialogTitle>
                    <AlertDialogDescription>
                    WARNING: Are you absolutely sure you want to permanently delete ALL documents in the System Knowledge Base? This action affects all users and cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                    onClick={handleDeleteAllSystemDocuments} 
                    disabled={isDeletingAllSystemDocs}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                    {isDeletingAllSystemDocs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Delete All System Docs
                    </AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <p className="text-sm text-muted-foreground mt-2">
Permanently remove all documents, metadata, and vector embeddings from the shared System Knowledge Base.
            </p>
          </div>

          {isDocsLoading ? (
            <div className="relative max-h-[60vh] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Filename</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded At</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`} className="transition-colors duration-150 ease-in-out hover:bg-muted/50">
                      <TableCell>
                        <Skeleton className="h-6 w-52" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-24" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-8 w-16 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : documents.length === 0 ? (
            <p>No documents found in the System Knowledge Base.</p>
          ) : (
            <div className="relative max-h-[60vh] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Filename</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded At</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc._id} className="transition-colors duration-150 ease-in-out hover:bg-muted/50">
                      <TableCell className="font-medium">{doc.originalFileName}</TableCell>
                      <TableCell>{formatBytes(doc.fileSize)}</TableCell>
                      <TableCell>{doc.uploadTimestamp ? doc.uploadTimestamp.substring(0, 10) : 'N/A'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteDocument(doc._id)}
                          className="transition-all duration-200 ease-in-out hover:bg-destructive/90 hover:scale-[1.02] active:scale-[0.98]"
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="users">
          <h2 className="text-2xl font-semibold mb-4">User Management</h2>
          {isUsersLoading ? (
            // Skeleton Table for Users
            <div className="relative max-h-[60vh] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={`user-skeleton-${index}`}>
                      <TableCell><Skeleton className="h-6 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell className="text-right space-x-1">
                        <Skeleton className="h-8 w-16 inline-block" />
                        <Skeleton className="h-8 w-16 inline-block" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : usersError ? (
            <p className="text-red-600 dark:text-red-400">Error loading users: {usersError}</p>
          ) : users.length === 0 ? (
            <p>No users found.</p>
          ) : (
            // Actual User Table
            <div className="relative max-h-[60vh] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u._id} className="transition-colors duration-150 ease-in-out hover:bg-muted/50">
                      <TableCell className="font-medium">{u.username}</TableCell>
                      <TableCell className="capitalize">{u.role}</TableCell>
                      <TableCell>{u.createdAt ? u.createdAt.substring(0, 10) : 'N/A'}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          disabled={u._id === user?.id}
                          onClick={() => openChangePasswordDialog(u)}
                        >
                          Change Password
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={u._id === user?.id}
                          onClick={() => {
                            console.log(`[Admin Users] Delete button clicked for user: ${u.username} (ID: ${u._id})`);
                            openDeleteUserConfirm(u); 
                          }}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="system">
          <p>System Settings placeholder.</p>
        </TabsContent>

        <TabsContent value="usage">
            <div className="bg-card p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-4">Monthly Usage Statistics</h2>
                {isUsageLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                ) : usageError ? (
                    <p className="text-destructive">Error loading usage data: {usageError}</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Username</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Month</TableHead>
                                <TableHead className="text-right">Prompt Tokens</TableHead>
                                <TableHead className="text-right">Completion Tokens</TableHead>
                                <TableHead className="text-right">Total Tokens</TableHead>
                                <TableHead className="text-right">Est. Cost (USD)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {userUsageData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center text-muted-foreground">No usage data available.</TableCell>
                                </TableRow>
                            ) : (
                                userUsageData.map((usage) => (
                                    <TableRow key={usage._id}>
                                        <TableCell className="font-medium">{usage.username}</TableCell>
                                        <TableCell>{usage.role}</TableCell>
                                        <TableCell>{usage.usageMonthMarker || '-'}</TableCell>
                                        <TableCell className="text-right">{(usage.currentMonthPromptTokens || 0).toLocaleString()}</TableCell>
                                        <TableCell className="text-right">{(usage.currentMonthCompletionTokens || 0).toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-semibold">{(usage.totalTokens || 0).toLocaleString()}</TableCell>
                                        <TableCell className="text-right">${(usage.currentMonthCost || 0).toFixed(6)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}
            </div>
        </TabsContent>
      </Tabs>

      {/* --- Delete User Confirmation Dialog --- */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user 
              <strong className="px-1">{userToDelete?.username || ''}</strong> 
              and remove their data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDeleteUserConfirm} disabled={isDeletingUser}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteUser} 
              disabled={isDeletingUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* --- Change Password Dialog --- */}
      <Dialog open={isChangePasswordDialogOpen} onOpenChange={setIsChangePasswordDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Change Password for {userToUpdate?.username || 'User'}</DialogTitle>
            <DialogDescription>
              Enter a new password for the user below. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newPassword" className="text-right">
                New Password
              </Label>
              <Input 
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="col-span-3" 
                disabled={isUpdatingPassword}
                autoComplete="new-password"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="confirmPassword" className="text-right">
                Confirm Password
              </Label>
              <Input 
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="col-span-3" 
                disabled={isUpdatingPassword}
              />
            </div>
            {passwordChangeError && (
              <p className="col-span-4 text-sm text-red-600 dark:text-red-400 text-center">{passwordChangeError}</p>
            )}
          </div>
          <DialogFooter>
             <DialogClose asChild>
               <Button type="button" variant="outline" disabled={isUpdatingPassword} onClick={closeChangePasswordDialog}>
                 Cancel
               </Button>
             </DialogClose>
            <Button type="submit" onClick={handleChangePassword} disabled={isUpdatingPassword}>
              {isUpdatingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
} 