'use client'; // Required if LoginForm/RegisterForm use client hooks like useState

import React from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sun, Moon } from 'lucide-react';
import LoginForm from '@/components/auth/LoginForm';
import RegisterForm from '@/components/auth/RegisterForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Import Card components

export default function AuthPage() {
  const { theme, setTheme } = useTheme();

  return (
    // Use dark background, center content, apply sans-serif font, relative positioning for toggle
    <div className="relative min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans">
      
      {/* Theme Toggle (Top Right) */}
      <div className="absolute top-4 right-4 flex items-center space-x-2">
        <Sun className="h-5 w-5 text-muted-foreground" /> 
        <Switch
          id="theme-mode-switch-auth"
          checked={theme === 'dark'}
          onCheckedChange={(checked: boolean) => setTheme(checked ? 'dark' : 'light')}
          aria-label={theme === 'dark' ? "Switch to light mode" : "Switch to dark mode"}
        />
        <Moon className="h-5 w-5 text-muted-foreground" /> 
      </div>

      <div className="w-full max-w-4xl text-center flex flex-col items-center"> 
        {/* Logo */}
        <div className="mb-6">
          <a 
            href="https://www.goldkeyinsurance.ca/" 
            target="_blank" 
            rel="noopener noreferrer"
            aria-label="Gold Key Insurance Homepage"
          >
            <Image 
              src="/gk_logo_new.png" 
              alt="Gold Key Insurance Logo" 
              width={180}
              height={50} 
              priority
            />
          </a>
        </div>

        <h1 className="text-4xl font-bold mb-10 text-foreground"> 
          GK CHATTY
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          {/* Use Card for Login Form */}
          <Card className="text-left">
            <CardHeader>
              <CardTitle>Login</CardTitle>
            </CardHeader>
            <CardContent>
              <LoginForm />
            </CardContent>
          </Card>
          {/* Use Card for Register Form */}
          <Card className="text-left">
            <CardHeader>
              <CardTitle>Register</CardTitle>
            </CardHeader>
            <CardContent>
              <RegisterForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 