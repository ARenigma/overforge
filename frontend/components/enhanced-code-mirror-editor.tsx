'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { EditorState } from '@codemirror/state';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { keymap } from '@codemirror/view';
import { indentUnit, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { accentColorCss } from '@/lib/brand';

/**
 * Bespoke dark syntax theme — charcoal background, cyber-green keywords.
 * Token hues mirror the design system (green 153, blue 199, amber 36, purple 280, yellow 47).
 */
const brandHighlight = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword],
    color: 'hsl(153 61% 60%)',
    fontWeight: '600',
  },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'hsl(199 89% 66%)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'hsl(36 96% 62%)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'hsl(280 65% 74%)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'hsl(47 95% 66%)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'hsl(0 0% 42%)', fontStyle: 'italic' },
  { tag: [t.variableName, t.propertyName, t.definition(t.variableName)], color: 'hsl(0 0% 90%)' },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: 'hsl(0 0% 55%)' },
  { tag: t.invalid, color: 'hsl(358 75% 65%)' },
]);

/** Light-mode syntax theme — same hues, darkened so they read on a paper background (the dark
 *  theme's light-L colors wash out on white). Chosen at editor build time by the active theme. */
const brandHighlightLight = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword],
    color: 'hsl(153 64% 30%)',
    fontWeight: '600',
  },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'hsl(199 85% 38%)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'hsl(28 82% 40%)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'hsl(280 58% 48%)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'hsl(40 88% 36%)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'hsl(0 0% 52%)', fontStyle: 'italic' },
  {
    tag: [t.variableName, t.propertyName, t.definition(t.variableName)],
    color: 'hsl(0 0% 15%)',
  },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: 'hsl(0 0% 42%)' },
  { tag: t.invalid, color: 'hsl(8 74% 46%)' },
]);

interface EnhancedCodeMirrorEditorProps {
  value: string;
  onCodeChangeAction: (value: string) => void;
  language?: string;
  tabSize?: number;
  onCursorPositionChangeAction?: (line: number, col: number) => void;
  onExecuteAction?: () => void;
  isExecuting?: boolean;
  /** Block paste + drop into the editor (integrity). */
  pasteDisabled?: boolean;
  /** Called when a paste/drop is blocked, so the room can show a hint. */
  onPasteBlockedAction?: () => void;
}

export function EnhancedCodeMirrorEditor({
  value,
  onCodeChangeAction,
  language = 'python',
  tabSize = 4,
  onCursorPositionChangeAction,
  onExecuteAction,
  isExecuting = false,
  pasteDisabled = false,
  onPasteBlockedAction,
}: EnhancedCodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isRecreatingRef = useRef(false); // Track when editor is being recreated
  // Bumped when the app's light/dark class flips, so the editor rebuilds with the matching theme
  // (the syntax HighlightStyle is static and can't track a token live).
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const obs = new MutationObserver(() => setThemeVersion((v) => v + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const getLanguageExtension = (lang: string) => {
    switch (lang.toLowerCase()) {
      case 'python':
        return python();
      case 'javascript':
      case 'js':
        return javascript();
      case 'java':
        return java();
      case 'cpp':
      case 'c++':
        return cpp();
      default:
        return python();
    }
  };

  // Create/recreate editor when language, tabSize, or isExecuting changes
  useEffect(() => {
    if (!editorRef.current) return;

    // Mark that we're recreating the editor
    isRecreatingRef.current = true;

    // Clean up existing editor
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    // Custom keymap for Ctrl+Enter to execute code
    const customKeymap = [
      {
        key: 'Ctrl-Enter',
        run: () => {
          if (onExecuteAction && !isExecuting) {
            onExecuteAction();
          }
          return true;
        },
      },
    ];

    const isDark = document.documentElement.classList.contains('dark');

    const extensions = [
      basicSetup,
      syntaxHighlighting(isDark ? brandHighlight : brandHighlightLight),
      getLanguageExtension(language),
      indentUnit.of(' '.repeat(tabSize)),
      keymap.of([...searchKeymap, ...customKeymap]),
      // Integrity: block paste + drop into the editor unless explicitly allowed.
      EditorView.domEventHandlers({
        paste(event) {
          if (pasteDisabled) {
            event.preventDefault();
            onPasteBlockedAction?.();
            return true;
          }
          return false;
        },
        drop(event) {
          if (pasteDisabled) {
            event.preventDefault();
            onPasteBlockedAction?.();
            return true;
          }
          return false;
        },
      }),
      highlightSelectionMatches(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onCodeChangeAction(update.state.doc.toString());
        }

        if (update.selectionSet && onCursorPositionChangeAction) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          const col = pos - line.from + 1;
          onCursorPositionChangeAction(line.number, col);
        }
      }),
      EditorView.theme({
        // Chrome reads design tokens, so the editor follows the app's light/dark theme instead of
        // being a hardcoded dark block (the "light mode - interview" fix).
        '&': {
          height: '100%',
          fontSize: '13px',
          backgroundColor: 'hsl(var(--card))',
          color: 'hsl(var(--foreground))',
        },
        '.cm-content': {
          padding: '12px',
          minHeight: '100%',
          lineHeight: '1.6',
          caretColor: accentColorCss(),
        },
        '.cm-focused': {
          outline: 'none',
        },
        '.cm-editor': {
          height: '100%',
          backgroundColor: 'hsl(var(--card))',
        },
        '.cm-scroller': {
          fontFamily:
            "var(--font-mono, 'JetBrains Mono', Consolas, Monaco, 'Courier New', monospace)",
        },
        '.cm-gutters': {
          backgroundColor: 'hsl(var(--muted))',
          borderRight: '1px solid hsl(var(--border)) !important',
          color: 'hsl(var(--foreground-ghost))',
        },
        '.cm-lineNumbers': {
          color: 'hsl(var(--foreground-ghost))',
          fontSize: '11px',
          minWidth: '3ch',
          paddingRight: '8px',
        },
        '.cm-activeLine': {
          backgroundColor: 'hsl(var(--accent) / 0.5)',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'hsl(var(--accent) / 0.5)',
          color: 'hsl(var(--foreground-subtle))',
        },
        '.cm-selectionMatch': {
          backgroundColor: accentColorCss(0.18),
        },
        '.cm-cursor': {
          borderLeftColor: accentColorCss(),
        },
        '.cm-searchMatch': {
          backgroundColor: 'hsl(36 96% 56% / 0.3)',
          outline: '1px solid hsl(36 96% 56% / 0.5)',
        },
        '.cm-searchMatch.cm-searchMatch-selected': {
          backgroundColor: 'hsl(36 96% 56% / 0.5)',
        },
      }),
    ];

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Mark recreation as complete on next tick
    setTimeout(() => {
      isRecreatingRef.current = false;
    }, 0);

    return () => {
      if (view) {
        view.destroy();
      }
    };
  }, [language, tabSize, isExecuting, pasteDisabled, themeVersion]);

  // Handle value changes (e.g., when switching between questions)
  useEffect(() => {
    // Skip update if editor is being recreated or doesn't exist
    if (!viewRef.current || isRecreatingRef.current) {
      return;
    }

    const currentContent = viewRef.current.state.doc.toString();

    // Only update if the content actually differs
    if (currentContent !== value) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return <div ref={editorRef} className="h-full w-full overflow-auto bg-background" />;
}
