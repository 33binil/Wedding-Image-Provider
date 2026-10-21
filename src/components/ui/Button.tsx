import React, { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer select-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

    const sizeStyles = {
      sm: 'text-xs py-1.5 px-3 gap-1.5',
      md: 'text-sm py-2.5 px-4 gap-2',
      lg: 'text-base py-3 px-6 gap-2.5',
    };

    const variantStyles = {
      primary:
        'bg-[#1C1917] hover:bg-[#292524] text-[#FBF9F5] shadow-sm hover:shadow active:scale-[0.99] focus-visible:ring-stone-600',
      secondary:
        'bg-[#F5F2EB] hover:bg-[#EAE4D7] text-[#292524] border border-[#E2DC CE] focus-visible:ring-stone-400',
      outline:
        'bg-transparent hover:bg-stone-100 text-stone-800 border border-stone-300 focus-visible:ring-stone-400',
      ghost:
        'bg-transparent hover:bg-stone-100 text-stone-700 hover:text-stone-900 focus-visible:ring-stone-300',
      danger:
        'bg-rose-700 hover:bg-rose-800 text-white shadow-sm focus-visible:ring-rose-500',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-current" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
