import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  change?: {
    value: string | number;
    trend: 'up' | 'down' | 'neutral';
    label?: string;
  };
  icon: LucideIcon;
  variant?: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'cyan';
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subValue,
  change,
  icon: Icon,
  variant = 'blue',
  onClick,
  className = ''
}) => {
  const colorMap = {
    blue: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      iconBg: 'bg-blue-500/20',
      text: 'text-blue-400',
      glow: 'group-hover:border-blue-500/40'
    },
    emerald: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      iconBg: 'bg-emerald-500/20',
      text: 'text-emerald-400',
      glow: 'group-hover:border-emerald-500/40'
    },
    amber: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      iconBg: 'bg-amber-500/20',
      text: 'text-amber-400',
      glow: 'group-hover:border-amber-500/40'
    },
    rose: {
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      iconBg: 'bg-rose-500/20',
      text: 'text-rose-400',
      glow: 'group-hover:border-rose-500/40'
    },
    purple: {
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
      iconBg: 'bg-purple-500/20',
      text: 'text-purple-400',
      glow: 'group-hover:border-purple-500/40'
    },
    cyan: {
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
      iconBg: 'bg-cyan-500/20',
      text: 'text-cyan-400',
      glow: 'group-hover:border-cyan-500/40'
    }
  };

  const c = colorMap[variant];

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden bg-slate-900/90 border ${c.border} ${c.glow} rounded-xl p-5 shadow-lg transition-all duration-300 ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''} ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {title}
          </span>
          <div className="flex items-baseline gap-2">
            <h4 className="text-2xl lg:text-3xl font-bold text-slate-100 font-mono tracking-tight">
              {value}
            </h4>
            {subValue && (
              <span className="text-xs text-slate-400">{subValue}</span>
            )}
          </div>

          {change && (
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={`font-semibold ${
                  change.trend === 'up'
                    ? 'text-emerald-400'
                    : change.trend === 'down'
                    ? 'text-rose-400'
                    : 'text-slate-400'
                }`}
              >
                {change.trend === 'up' ? '↑' : change.trend === 'down' ? '↓' : '•'} {change.value}
              </span>
              {change.label && <span className="text-slate-400">{change.label}</span>}
            </div>
          )}
        </div>

        <div className={`p-3 rounded-lg ${c.iconBg} ${c.text} ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-110`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
