'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CommandMenuDialog } from '@/components/ds/command-menu';

/**
 * Mounts the global ⌘K / Ctrl+K listener and hosts the Command Menu dialog. Rendered once at
 * the root layout so the palette is available on every surface. Resolves auth state lazily each
 * time the menu opens so Sign in / Sign out stays correct.
 */
export function CommandMenuProvider() {
  const [open, setOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (active) setIsAuthed(!!data.session);
      });
    return () => {
      active = false;
    };
  }, [open]);

  return <CommandMenuDialog open={open} onOpenChange={setOpen} isAuthed={isAuthed} />;
}
