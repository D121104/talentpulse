import { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link as LinkIcon,
  Unlink,
  Table as TableIcon,
  RotateCcw,
  RotateCw,
  RemoveFormatting,
  Code2,
  ChevronDown,
  Palette,
  Highlighter,
  Plus,
  Trash2,
  Columns3,
  Rows3,
  Check,
  X,
} from 'lucide-react';

// Custom TipTap Extension for Font Size
export const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return {
      types: ['textStyle'],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize?.replace(/['"]+/g, ''),
            renderHTML: (attributes) => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }: any) => {
          return chain().setMark('textStyle', { fontSize }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }: any) => {
          return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
        },
    } as any;
  },
});

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  disabled?: boolean;
}

const FONT_FAMILIES = [
  { name: 'Mặc định (Inter / Sans)', value: 'Inter, system-ui, sans-serif' },
  { name: 'Roboto', value: 'Roboto, sans-serif' },
  { name: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { name: 'Times New Roman (Serif)', value: '"Times New Roman", Times, serif' },
  { name: 'Georgia (Serif)', value: 'Georgia, serif' },
  { name: 'Courier New (Monospace)', value: '"Courier New", Courier, monospace' },
  { name: 'Montserrat', value: 'Montserrat, sans-serif' },
  { name: 'Poppins', value: 'Poppins, sans-serif' },
];

const FONT_SIZES = [
  { name: '12px (Nhỏ)', value: '12px' },
  { name: '14px (Vừa)', value: '14px' },
  { name: '16px (Chuẩn)', value: '16px' },
  { name: '18px (Lớn)', value: '18px' },
  { name: '20px (Tiêu đề phụ)', value: '20px' },
  { name: '24px (Tiêu đề 3)', value: '24px' },
  { name: '28px (Tiêu đề 2)', value: '28px' },
  { name: '32px (Tiêu đề chính)', value: '32px' },
];

const TEXT_COLORS = [
  { name: 'Tự động', color: 'inherit' },
  { name: 'Đen đậm', color: '#0f172a' },
  { name: 'Xám đậm', color: '#475569' },
  { name: 'Xanh TalentPulse', color: '#2563eb' },
  { name: 'Xanh ngọc', color: '#0891b2' },
  { name: 'Xanh lá', color: '#16a34a' },
  { name: 'Cam vàng', color: '#d97706' },
  { name: 'Đỏ son', color: '#dc2626' },
  { name: 'Tím violet', color: '#7c3aed' },
  { name: 'Hồng phấn', color: '#db2777' },
];

const HIGHLIGHT_COLORS = [
  { name: 'Không highlight', color: 'none' },
  { name: 'Vàng rực', color: '#fef08a' },
  { name: 'Xanh lục dịu', color: '#bbf7d0' },
  { name: 'Xanh lam nhẹ', color: '#bae6fd' },
  { name: 'Hồng nhạt', color: '#fbcfe8' },
  { name: 'Cam ấm', color: '#fed7aa' },
  { name: 'Tím nhạt', color: '#e9d5ff' },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Nhập nội dung mô tả chi tiết...',
  minHeight = '240px',
  className = '',
  disabled = false,
}: RichTextEditorProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const [rawHtml, setRawHtml] = useState(value || '');

  const colorRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
      if (highlightRef.current && !highlightRef.current.contains(e.target as Node)) {
        setShowHighlightPicker(false);
      }
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        setShowTableMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TextStyle,
      FontSize,
      FontFamily.configure({
        types: ['textStyle'],
      }),
      Color.configure({
        types: ['textStyle'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline hover:text-primary-dark cursor-pointer',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse table-auto w-full my-3 border border-slate-200 dark:border-slate-700',
        },
      }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2 font-bold text-left',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-slate-200 dark:border-slate-700 p-2',
        },
      }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // If empty tip tap output like <p></p>, treat as empty
      const cleanHtml = html === '<p></p>' ? '' : html;
      setRawHtml(cleanHtml);
      onChange(cleanHtml);
    },
  });

  // Synchronize external value changes (e.g. form reset or loading existing item)
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    const normalizedProp = value || '';
    const normalizedCurrent = currentHtml === '<p></p>' ? '' : currentHtml;

    if (normalizedProp !== normalizedCurrent && !editor.isFocused) {
      editor.commands.setContent(normalizedProp);
      setRawHtml(normalizedProp);
    }
  }, [value, editor]);

  // Sync disabled state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  if (!editor) {
    return null;
  }

  // Handle Hyperlink insertion
  const handleOpenLinkModal = () => {
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkUrl(previousUrl);
    setShowLinkModal(true);
  };

  const handleApplyLink = () => {
    if (!linkUrl.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      let formattedUrl = linkUrl.trim();
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = `https://${formattedUrl}`;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: formattedUrl }).run();
    }
    setShowLinkModal(false);
    setLinkUrl('');
  };

  const handleRemoveLink = () => {
    editor.chain().focus().unsetLink().run();
    setShowLinkModal(false);
  };

  // Handle Raw HTML switch
  const handleToggleHtmlMode = () => {
    if (isHtmlMode) {
      // Switching from HTML to Visual
      editor.commands.setContent(rawHtml);
      onChange(rawHtml);
      setIsHtmlMode(false);
    } else {
      // Switching from Visual to HTML
      setRawHtml(editor.getHTML());
      setIsHtmlMode(true);
    }
  };

  const handleRawHtmlChange = (newHtml: string) => {
    setRawHtml(newHtml);
    onChange(newHtml);
  };

  // Word & Character count calculation
  const textContent = editor.getText();
  const wordCount = textContent.trim() ? textContent.trim().split(/\s+/).length : 0;
  const charCount = textContent.length;

  // Active state helpers
  const currentHeading = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
    ? 'h2'
    : editor.isActive('heading', { level: 3 })
    ? 'h3'
    : editor.isActive('blockquote')
    ? 'quote'
    : editor.isActive('codeBlock')
    ? 'codeBlock'
    : 'p';

  return (
    <div
      className={`group relative flex flex-col rounded-2xl border border-slate-200 bg-white transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 dark:border-slate-700 dark:bg-slate-900 ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      } ${className}`}
    >
      {/* ========================================================================= */}
      {/* 1. WORD-LIKE TOOLBAR HEADER                                              */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200/90 bg-slate-50/90 p-2 dark:border-slate-800 dark:bg-slate-800/80 rounded-t-2xl">
        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 pr-1 border-r border-slate-200 dark:border-slate-700">
          <button
            type="button"
            title="Hoàn tác (Ctrl+Z)"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white transition"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Làm lại (Ctrl+Y)"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white transition"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        {/* Font Family Dropdown */}
        <div className="flex items-center pr-1 border-r border-slate-200 dark:border-slate-700">
          <div className="relative">
            <select
              aria-label="Chọn Font chữ"
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'default') {
                  editor.chain().focus().unsetFontFamily().run();
                } else {
                  editor.chain().focus().setFontFamily(val).run();
                }
              }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-100 hover:text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer transition-colors"
            >
              <option value="default" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                Phông chữ
              </option>
              {FONT_FAMILIES.map((font) => (
                <option
                  key={font.value}
                  value={font.value}
                  className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                >
                  {font.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Font Size Dropdown */}
        <div className="flex items-center pr-1 border-r border-slate-200 dark:border-slate-700">
          <select
            aria-label="Chọn Cỡ chữ"
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'default') {
                (editor.chain().focus() as any).unsetFontSize().run();
              } else {
                (editor.chain().focus() as any).setFontSize(val).run();
              }
            }}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-100 hover:text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer transition-colors"
          >
            <option value="default" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              Cỡ chữ
            </option>
            {FONT_SIZES.map((size) => (
              <option
                key={size.value}
                value={size.value}
                className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-200"
              >
                {size.name}
              </option>
            ))}
          </select>
        </div>

        {/* Heading & Paragraph Styles Dropdown */}
        <div className="flex items-center pr-1 border-r border-slate-200 dark:border-slate-700">
          <select
            aria-label="Kiểu đoạn văn & Tiêu đề"
            value={currentHeading}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'p') editor.chain().focus().setParagraph().run();
              else if (val === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run();
              else if (val === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run();
              else if (val === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run();
              else if (val === 'quote') editor.chain().focus().toggleBlockquote().run();
              else if (val === 'codeBlock') editor.chain().focus().toggleCodeBlock().run();
            }}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 hover:text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer transition-colors"
          >
            <option value="p" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              Đoạn văn (Normal)
            </option>
            <option value="h1" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              Tiêu đề lớn (H1)
            </option>
            <option value="h2" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              Tiêu đề vừa (H2)
            </option>
            <option value="h3" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              Tiêu đề nhỏ (H3)
            </option>
            <option value="quote" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              Trích dẫn (Quote)
            </option>
            <option value="codeBlock" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              Khối mã nguồn (Code)
            </option>
          </select>
        </div>

        {/* Basic Formats (Bold, Italic, Underline, Strike, Code) */}
        <div className="flex items-center gap-0.5 pr-1 border-r border-slate-200 dark:border-slate-700">
          <button
            type="button"
            title="In đậm (Ctrl+B)"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition ${
              editor.isActive('bold')
                ? 'bg-primary text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="In nghiêng (Ctrl+I)"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition ${
              editor.isActive('italic')
                ? 'bg-primary text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Gạch chân (Ctrl+U)"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition ${
              editor.isActive('underline')
                ? 'bg-primary text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <UnderlineIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Gạch ngang chữ"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition ${
              editor.isActive('strike')
                ? 'bg-primary text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <Strikethrough className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Mã nội dòng (Inline Code)"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition ${
              editor.isActive('code')
                ? 'bg-primary text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <Code className="h-4 w-4" />
          </button>
        </div>

        {/* Text Color & Highlight Pickers */}
        <div className="flex items-center gap-1 pr-1 border-r border-slate-200 dark:border-slate-700">
          {/* Text Color Popover */}
          <div className="relative" ref={colorRef}>
            <button
              type="button"
              title="Màu chữ"
              onClick={() => {
                setShowColorPicker(!showColorPicker);
                setShowHighlightPicker(false);
                setShowTableMenu(false);
              }}
              className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white transition cursor-pointer"
            >
              <Palette className="h-4 w-4 text-primary" />
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {showColorPicker && (
              <div className="absolute left-0 top-full z-50 mt-1.5 w-48 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-in fade-in zoom-in-95 duration-100">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Màu chữ
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {TEXT_COLORS.map((item) => (
                    <button
                      key={item.color}
                      type="button"
                      title={item.name}
                      onClick={() => {
                        if (item.color === 'inherit') {
                          editor.chain().focus().unsetColor().run();
                        } else {
                          editor.chain().focus().setColor(item.color).run();
                        }
                        setShowColorPicker(false);
                      }}
                      className="group relative flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 hover:scale-110 transition dark:border-slate-600 cursor-pointer"
                      style={{ backgroundColor: item.color === 'inherit' ? 'transparent' : item.color }}
                    >
                      {item.color === 'inherit' && (
                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">A</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Highlight Color Popover */}
          <div className="relative" ref={highlightRef}>
            <button
              type="button"
              title="Bút dạ quang (Highlight)"
              onClick={() => {
                setShowHighlightPicker(!showHighlightPicker);
                setShowColorPicker(false);
                setShowTableMenu(false);
              }}
              className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white transition cursor-pointer"
            >
              <Highlighter className="h-4 w-4 text-amber-500" />
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {showHighlightPicker && (
              <div className="absolute left-0 top-full z-50 mt-1.5 w-48 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-in fade-in zoom-in-95 duration-100">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Màu Highlight
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {HIGHLIGHT_COLORS.map((item) => (
                    <button
                      key={item.color}
                      type="button"
                      title={item.name}
                      onClick={() => {
                        if (item.color === 'none') {
                          editor.chain().focus().unsetHighlight().run();
                        } else {
                          editor.chain().focus().setHighlight({ color: item.color }).run();
                        }
                        setShowHighlightPicker(false);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 text-xs font-bold hover:scale-110 transition dark:border-slate-600 cursor-pointer"
                      style={{ backgroundColor: item.color === 'none' ? 'transparent' : item.color }}
                    >
                      {item.color === 'none' && <X className="h-3.5 w-3.5 text-rose-500" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Alignment (Left, Center, Right, Justify) */}
        <div className="flex items-center gap-0.5 pr-1 border-r border-slate-200 dark:border-slate-700">
          <button
            type="button"
            title="Căn trái"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition cursor-pointer ${
              editor.isActive({ textAlign: 'left' })
                ? 'bg-primary text-white'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <AlignLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Căn giữa"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition cursor-pointer ${
              editor.isActive({ textAlign: 'center' })
                ? 'bg-primary text-white'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <AlignCenter className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Căn phải"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition cursor-pointer ${
              editor.isActive({ textAlign: 'right' })
                ? 'bg-primary text-white'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <AlignRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Căn đều 2 bên (Justify)"
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition cursor-pointer ${
              editor.isActive({ textAlign: 'justify' })
                ? 'bg-primary text-white'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <AlignJustify className="h-4 w-4" />
          </button>
        </div>

        {/* Lists & Quotes */}
        <div className="flex items-center gap-0.5 pr-1 border-r border-slate-200 dark:border-slate-700">
          <button
            type="button"
            title="Danh sách gạch đầu dòng"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition cursor-pointer ${
              editor.isActive('bulletList')
                ? 'bg-primary text-white'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Danh sách đánh số"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition cursor-pointer ${
              editor.isActive('orderedList')
                ? 'bg-primary text-white'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Khối trích dẫn (Quote)"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition cursor-pointer ${
              editor.isActive('blockquote')
                ? 'bg-primary text-white'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <Quote className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Đường kẻ ngang phân cách"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white transition cursor-pointer"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        {/* Hyperlink & Table Management */}
        <div className="flex items-center gap-0.5 pr-1 border-r border-slate-200 dark:border-slate-700">
          {/* Link button */}
          <button
            type="button"
            title={editor.isActive('link') ? 'Sửa liên kết' : 'Chèn liên kết'}
            onClick={handleOpenLinkModal}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition cursor-pointer ${
              editor.isActive('link')
                ? 'bg-primary text-white'
                : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <LinkIcon className="h-4 w-4" />
          </button>

          {/* Table Management Popover */}
          <div className="relative" ref={tableRef}>
            <button
              type="button"
              title="Quản lý Bảng biểu"
              onClick={() => {
                setShowTableMenu(!showTableMenu);
                setShowColorPicker(false);
                setShowHighlightPicker(false);
              }}
              className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition cursor-pointer ${
                editor.isActive('table')
                  ? 'bg-primary/20 text-primary dark:bg-primary/30'
                  : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
              }`}
            >
              <TableIcon className="h-4 w-4" />
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {showTableMenu && (
              <div className="absolute right-0 sm:left-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-in fade-in zoom-in-95 duration-100">
                <div className="space-y-1 text-xs">
                  {!editor.isActive('table') ? (
                    <button
                      type="button"
                      onClick={() => {
                        editor
                          .chain()
                          .focus()
                          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                          .run();
                        setShowTableMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5 text-primary" />
                      <span>Chèn bảng 3x3</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().addRowBefore().run();
                          setShowTableMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
                      >
                        <Rows3 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Thêm hàng phía trên</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().addRowAfter().run();
                          setShowTableMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
                      >
                        <Rows3 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Thêm hàng phía dưới</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().addColumnBefore().run();
                          setShowTableMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
                      >
                        <Columns3 className="h-3.5 w-3.5 text-blue-600" />
                        <span>Thêm cột bên trái</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().addColumnAfter().run();
                          setShowTableMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
                      >
                        <Columns3 className="h-3.5 w-3.5 text-blue-600" />
                        <span>Thêm cột bên phải</span>
                      </button>
                      <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().deleteRow().run();
                          setShowTableMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Xóa hàng hiện tại</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().deleteColumn().run();
                          setShowTableMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Xóa cột hiện tại</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().deleteTable().run();
                          setShowTableMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Xóa toàn bộ bảng</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Clear formatting & HTML Mode */}
        <div className="flex items-center gap-0.5 ml-auto">
          <button
            type="button"
            title="Xóa toàn bộ định dạng"
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white transition cursor-pointer"
          >
            <RemoveFormatting className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={isHtmlMode ? 'Chuyển sang soạn thảo trực quan' : 'Xem & sửa mã HTML'}
            onClick={handleToggleHtmlMode}
            className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold transition cursor-pointer ${
              isHtmlMode
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            <Code2 className="h-4 w-4" />
            <span className="hidden sm:inline">{isHtmlMode ? 'Visual' : 'HTML'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. LINK POPUP / MODAL                                                    */}
      {/* ========================================================================= */}
      {showLinkModal && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100/90 px-4 py-2 text-xs dark:border-slate-800 dark:bg-slate-800">
          <LinkIcon className="h-4 w-4 text-primary shrink-0" />
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Nhập đường dẫn URL (vd: https://example.com)..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApplyLink();
              }
            }}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 focus:border-primary focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            autoFocus
          />
          <button
            type="button"
            onClick={handleApplyLink}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 font-bold text-white hover:bg-primary-dark cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Áp dụng</span>
          </button>
          {editor.isActive('link') && (
            <button
              type="button"
              onClick={handleRemoveLink}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-3 py-1 font-bold text-rose-700 hover:bg-rose-200 dark:bg-rose-950/50 dark:text-rose-300 cursor-pointer"
            >
              <Unlink className="h-3.5 w-3.5" />
              <span>Gỡ link</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowLinkModal(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. EDITOR BODY (VISUAL OR RAW HTML)                                      */}
      {/* ========================================================================= */}
      <div className="relative flex-1 p-4" style={{ minHeight }}>
        {isHtmlMode ? (
          <textarea
            value={rawHtml}
            onChange={(e) => handleRawHtmlChange(e.target.value)}
            disabled={disabled}
            placeholder="<p>Nhập mã HTML vào đây...</p>"
            className="h-full w-full font-mono text-xs text-slate-800 bg-transparent focus:outline-none dark:text-slate-200 resize-y"
            style={{ minHeight }}
          />
        ) : (
          <EditorContent
            editor={editor}
            className="tiptap-content prose prose-slate max-w-none text-sm text-slate-900 focus:outline-none dark:prose-invert dark:text-slate-100"
            style={{ minHeight }}
          />
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. STATUS & STATS BAR                                                    */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 rounded-b-2xl">
        <div className="flex items-center gap-3">
          <span>
            Số từ: <strong className="text-slate-800 dark:text-slate-200">{wordCount}</strong>
          </span>
          <span>&bull;</span>
          <span>
            Số ký tự: <strong className="text-slate-800 dark:text-slate-200">{charCount}</strong>
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-slate-400 text-[10px]">
          <span>Phím tắt: In đậm (Ctrl+B), In nghiêng (Ctrl+I), Gạch chân (Ctrl+U)</span>
        </div>
      </div>
    </div>
  );
}
