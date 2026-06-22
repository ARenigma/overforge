'use client';

import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/theme-provider';
import { createClient } from '@/lib/supabase/client';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  CreditCard,
  Home,
  Layers,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
  PlayCircle,
  Sun,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Product', href: '/product', icon: Layers },
  { label: 'How it works', href: '/how-it-works', icon: PlayCircle },
  { label: 'Pricing', href: '/pricing', icon: CreditCard },
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
];

/**
 * Command Menu dialog (Supabase design-system "Command Menu"): ⌘K palette for navigation
 * and quick actions. Controlled by CommandMenuProvider, which owns the global key listener.
 */
export function CommandMenuDialog({
  open,
  onOpenChange,
  isAuthed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAuthed: boolean | null;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  function toggleTheme() {
    onOpenChange(false);
    setTheme(isDark ? 'light' : 'dark');
  }

  async function signOut() {
    onOpenChange(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
            <CommandItem key={href} value={label} onSelect={() => go(href)}>
              <Icon className="text-muted-foreground" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem value="toggle theme" onSelect={toggleTheme}>
            {isDark ? (
              <Sun className="text-muted-foreground" />
            ) : (
              <Moon className="text-muted-foreground" />
            )}
            Toggle theme
          </CommandItem>
          {isAuthed ? (
            <CommandItem value="sign out" onSelect={signOut}>
              <LogOut className="text-muted-foreground" />
              Sign out
            </CommandItem>
          ) : (
            <CommandItem value="sign in" onSelect={() => go('/auth')}>
              <LogIn className="text-muted-foreground" />
              Sign in
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
