import React, { ButtonHTMLAttributes } from 'react';
import { LucideIcon } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: 'start' | 'end';
  isLoading?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'start',
  isLoading = false,
  loading = false,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}) => {
  const isButtonLoading = isLoading || loading;
  const baseStyles = "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap cursor-pointer";

  const sizeStyles: Record<ButtonSize, string> = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-6 py-3 text-base gap-2.5"
  };

  const variantStyles: Record<ButtonVariant, string> = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-900/30 focus:ring-blue-500 border border-blue-500/30",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/80 focus:ring-slate-600",
    outline: "bg-transparent hover:bg-slate-800/60 text-slate-200 border border-slate-700 focus:ring-slate-500",
    danger: "bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-900/30 focus:ring-rose-500 border border-rose-500/30",
    success: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-900/30 focus:ring-emerald-500 border border-emerald-500/30",
    ghost: "bg-transparent hover:bg-slate-800/50 text-slate-300 hover:text-white border-transparent"
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || isButtonLoading}
      {...props}
    >
      {isButtonLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
      ) : (
        Icon && iconPosition === 'start' && <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
      )}
      <span>{children}</span>
      {!isButtonLoading && Icon && iconPosition === 'end' && (
        <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
      )}
    </button>
  );
};
