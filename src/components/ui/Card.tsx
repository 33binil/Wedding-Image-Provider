import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'subtle' | 'accent';
}

export function Card({
  children,
  variant = 'default',
  className = '',
  ...props
}: CardProps) {
  const variantStyles = {
    default: 'bg-white border border-stone-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
    elevated: 'bg-white border border-stone-200 shadow-md hover:shadow-lg transition-shadow',
    subtle: 'bg-[#F9F7F2] border border-[#ECE6DB]',
    accent: 'bg-gradient-to-br from-[#FDFBF7] to-[#F5EFE6] border border-[#E4D8C5] shadow-sm',
  };

  return (
    <div className={`rounded-xl p-5 md:p-6 ${variantStyles[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 pb-4 border-b border-stone-100 ${className}`}>
      <div>
        <h3 className="text-base font-semibold text-stone-900 tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-stone-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
