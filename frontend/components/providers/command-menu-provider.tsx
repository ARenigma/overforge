'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CommandMenuDialog } from '@/components/ds/command-menu';
import { OPEN_COMMAND_MENU_EVENT } from '@/components/ds/command-menu-trigger';

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

  // Visible affordances (CommandMenuTrigger) open the palette via a custom window event.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_COMMAND_MENU_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_COMMAND_MENU_EVENT, onOpen);
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
