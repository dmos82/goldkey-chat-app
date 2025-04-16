import React from 'react';

// Remove the children prop from the interface and component definition
interface HeaderProps {
  // No children needed for this static header
}

// Update component signature and remove children prop usage
export const Header: React.FC<HeaderProps> = () => {
  // Apply Tailwind classes matching the #app-header style from the mockup v10
  // Ensure correct height, background, border, padding, flex properties etc.
  // Add GK text and styling
  return (
    <header className="h-[48px] bg-background-light dark:bg-background-dark border-b border-border-light dark:border-border-dark flex items-center justify-between px-4 flex-shrink-0 shadow-sm z-10">
      {/* Display GK text - adjust font/styling as needed */}
      <span className="font-semibold text-lg text-text-primary-light dark:text-text-primary-dark">
        GK
      </span>
      {/* Removed {children} */}
    </header>
  );
};

// Optional: export default Header; if preferred 