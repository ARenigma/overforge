'use client';

import { useEffect, useRef } from 'react';
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

interface EnhancedCodeMirrorEditorProps {
  value: string;
  onCodeChangeAction: (value: string) => void;
  language?: string;
  searchQuery?: string;
  tabSize?: number;
  onCursorPositionChangeAction?: (line: number, col: number) => void;
  onExecuteAction?: () => void;
  isExecuting?: boolean;
}

export function EnhancedCodeMirrorEditor({
  value,
  onCodeChangeAction,
  language = 'python',
  searchQuery = '',
  tabSize = 4,
  onCursorPositionChangeAction,
  onExecuteAction,
  isExecuting = false,
}: EnhancedCodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isRecreatingRef = useRef(false); // Track when editor is being recreated
  const lastValueRef = useRef<string>(value); // Track last value

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

    const extensions = [
      basicSetup,
      syntaxHighlighting(brandHighlight),
      getLanguageExtension(language),
      indentUnit.of(' '.repeat(tabSize)),
      keymap.of([...searchKeymap, ...customKeymap]),
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
        '&': {
          height: '100%',
          fontSize: '13px',
          backgroundColor: 'hsl(0 0% 6%)',
          color: 'hsl(0 0% 92%)',
        },
        '.cm-content': {
          padding: '12px',
          minHeight: '100%',
          lineHeight: '1.6',
          caretColor: 'hsl(153 61% 53%)',
        },
        '.cm-focused': {
          outline: 'none',
        },
        '.cm-editor': {
          height: '100%',
          backgroundColor: 'hsl(0 0% 6%)',
        },
        '.cm-scroller': {
          fontFamily:
            "var(--font-mono, 'JetBrains Mono', Consolas, Monaco, 'Courier New', monospace)",
        },
        '.cm-gutters': {
          backgroundColor: 'hsl(0 0% 9%)',
          borderRight: '1px solid hsl(0 0% 18%) !important',
          color: 'hsl(0 0% 40%)',
        },
        '.cm-lineNumbers': {
          color: 'hsl(0 0% 40%)',
          fontSize: '11px',
          minWidth: '3ch',
          paddingRight: '8px',
        },
        '.cm-activeLine': {
          backgroundColor: 'hsl(0 0% 11%)',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'hsl(0 0% 11%)',
          color: 'hsl(0 0% 65%)',
        },
        '.cm-selectionMatch': {
          backgroundColor: 'hsl(153 61% 53% / 0.18)',
        },
        '.cm-cursor': {
          borderLeftColor: 'hsl(153 61% 53%)',
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
  }, [language, tabSize, isExecuting]);

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
