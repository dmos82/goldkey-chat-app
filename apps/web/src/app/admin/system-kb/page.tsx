'use client';

import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import AdminProtectedRoute from '@/components/auth/AdminProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast"; // Ensure you have toast component set up
import { Trash2, UploadCloud, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE_URL } from '@/lib/config';

// Define the structure for system documents
interface SystemDocument {
  _id: string;
  originalFileName: string;
  uploadTimestamp: string; // Assuming string format from API, adjust if Date object
  // Add other relevant fields if provided by the API
}

const AdminSystemKbPage: React.FC = () => {
  const { token } = useAuth();
  const { toast } = useToast();
  const [systemDocs, setSystemDocs] = useState<SystemDocument[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [docToDelete, setDocToDelete] = useState<SystemDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Fetch documents
  const fetchDocuments = async () => {
    console.log('AdminSystemKbPage: Fetching documents...');
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/system-kb/documents`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.statusText}`);
      }
      const data: SystemDocument[] = await response.json();
      setSystemDocs(data);
      console.log('AdminSystemKbPage: Documents fetched successfully', data);
    } catch (err: any) {
      console.error('AdminSystemKbPage: Error fetching documents:', err);
      setError(err.message || 'An unknown error occurred');
      toast({ title: "Error", description: `Failed to fetch documents: ${err.message}`, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch documents on mount and when token changes
  useEffect(() => {
    if (token) {
      fetchDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // Re-fetch if token changes (e.g., after login)

  // Handle file selection
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      console.log('AdminSystemKbPage: File selected:', event.target.files[0].name);
    } else {
      setSelectedFile(null);
    }
  };

  // Handle file upload
  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      toast({ title: "Upload Error", description: "Please select a file to upload.", variant: "destructive" });
      return;
    }
    if (!token) {
      toast({ title: "Auth Error", description: "Authentication token not found.", variant: "destructive" });
      return;
    }

    console.log('AdminSystemKbPage: Starting upload for file:', selectedFile.name);
    setIsUploading(true);
    const formData = new FormData();
    formData.append('systemDocument', selectedFile); // Match the field name expected by Multer

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/system-kb/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // 'Content-Type': 'multipart/form-data' is set automatically by fetch with FormData
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `Upload failed with status: ${response.status}`);
      }

      const result = await response.json();
      console.log('AdminSystemKbPage: Upload successful:', result);
      toast({ title: "Upload Successful", description: `'${selectedFile.name}' uploaded successfully.` });
      setSelectedFile(null); // Clear the selected file
      // Refresh the document list
      await fetchDocuments(); 
    } catch (err: any) {
      console.error('AdminSystemKbPage: Upload error:', err);
      toast({ title: "Upload Failed", description: err.message || 'An unknown error occurred during upload.', variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!docToDelete || !token) {
      toast({ title: "Error", description: "Document or token missing for deletion.", variant: "destructive" });
      return;
    }

    console.log('AdminSystemKbPage: Attempting to delete document:', docToDelete._id);
    setIsDeleting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/system-kb/documents/${docToDelete._id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `Delete failed with status: ${response.status}`);
      }

      console.log('AdminSystemKbPage: Document deleted successfully:', docToDelete._id);
      toast({ title: "Delete Successful", description: `'${docToDelete.originalFileName}' deleted.` });
      // Optimistically remove from local state
      setSystemDocs(prevDocs => prevDocs.filter(doc => doc._id !== docToDelete._id));
      setDocToDelete(null); // Close the dialog
    } catch (err: any) {
      console.error('AdminSystemKbPage: Delete error:', err);
      toast({ title: "Delete Failed", description: err.message || 'An unknown error occurred during deletion.', variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AdminProtectedRoute>
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold mb-6">System Knowledge Base Management</h1>

        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Upload New Document</CardTitle>
            <CardDescription>Add a new PDF document to the system knowledge base.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="flex flex-col sm:flex-row gap-4 items-center">
              <Input
                type="file"
                accept=".pdf" // Accept only PDF files
                onChange={handleFileChange}
                className="flex-grow"
                disabled={isUploading}
              />
              <Button type="submit" disabled={!selectedFile || isUploading}>
                {isUploading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
                ) : (
                  <><UploadCloud className="mr-2 h-4 w-4" /> Upload Document</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Document List Section */}
        <Card>
           <CardHeader>
             <CardTitle>Current System Documents</CardTitle>
             <CardDescription>View and manage documents currently in the system KB.</CardDescription>
           </CardHeader>
           <CardContent>
            {isLoading && (
              <div className="flex justify-center items-center p-6">
                 <Loader2 className="h-6 w-6 animate-spin text-primary" />
                 <span className="ml-2">Loading documents...</span>
               </div>
            )}
            {error && <p className="text-red-500 text-center p-4">Error loading documents: {error}</p>}
            {!isLoading && !error && (
              <Table>
                <TableCaption>A list of your system knowledge base documents.</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filename</TableHead>
                    <TableHead>Uploaded On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systemDocs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center">No system documents found.</TableCell>
                    </TableRow>
                  ) : (
                    systemDocs.map((doc) => (
                      <TableRow key={doc._id}>
                        <TableCell className="font-medium">{doc.originalFileName}</TableCell>
                        <TableCell>{new Date(doc.uploadTimestamp).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setDocToDelete(doc)}>
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete {doc.originalFileName}</span>
                            </Button>
                          </AlertDialogTrigger>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
           </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the document 
                <span className="font-semibold">{docToDelete?.originalFileName}</span>
                 and remove its associated data from the knowledge base.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDocToDelete(null)} disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isDeleting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>
                  ) : (
                    "Yes, delete document"
                  )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminProtectedRoute>
  );
};

export default AdminSystemKbPage; 