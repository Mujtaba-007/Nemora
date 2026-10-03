'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { LogIn, LogOut, User, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserChip() {
  const { status, profile, user, openAuthModal, signOut } = useAuthStore();

  if (status === 'loading') {
    return (
      <div className="h-8 w-24 bg-white/5 border border-glass-border rounded-lg animate-pulse" />
    );
  }

  if (status === 'anon' || !user) {
    return (
      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => openAuthModal('login')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs text-neon-green border border-neon-green/40 bg-neon-green/10 hover:bg-neon-green/20 transition-all duration-200 shadow-[0_0_12px_rgba(0,255,136,0.2)]"
      >
        <LogIn className="w-3.5 h-3.5" />
        <span>Log in</span>
      </motion.button>
    );
  }

  const username = profile?.username || 'user';
  const coins = profile?.coins ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-black/40 border border-glass-border hover:border-neon-green/50 transition-all text-xs font-mono outline-none focus:ring-1 focus:ring-neon-green"
        >
          {/* User badge */}
          <div className="flex items-center gap-1 text-foreground">
            <span className="text-neon-green font-bold">@</span>
            <span className="max-w-[100px] truncate">{username}</span>
          </div>

          <div className="h-3 w-px bg-glass-border" />

          {/* Coins badge */}
          <div className="flex items-center gap-1 text-[#F5C518] font-bold">
            <span>🪙</span>
            <span>{coins}</span>
          </div>

          <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-48 bg-cosmic border border-glass-border text-foreground font-mono text-xs shadow-[0_0_20px_rgba(0,0,0,0.8)]"
      >
        <DropdownMenuLabel className="font-normal text-muted-foreground text-[11px]">
          Signed in as <span className="text-neon-green font-bold block truncate">@{username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-glass-border" />
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>CO2 Saved:</span>
            <span className="text-neon-green font-bold">{profile?.total_co2_saved?.toFixed(1) || '0.0'}g</span>
          </div>
          <div className="flex justify-between">
            <span>Hunts:</span>
            <span className="text-foreground">{profile?.prompts_optimized || 0}</span>
          </div>
        </div>
        <DropdownMenuSeparator className="bg-glass-border" />
        <DropdownMenuItem
          onClick={() => signOut()}
          className="text-neon-red hover:bg-neon-red/10 focus:bg-neon-red/10 cursor-pointer flex items-center gap-2"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
