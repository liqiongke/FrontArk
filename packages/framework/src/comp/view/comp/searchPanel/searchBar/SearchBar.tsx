import { useSafeState, useMemoizedFn } from 'ahooks';
import { isString } from 'lodash';
import { useEffect, useMemo, useRef } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';

import { type SearchPlaneItem, type SearchValueKind } from '../interface';
import { inferSearchType } from './infer/inferSearchType';
import { parseDateInput, parseDateRangeInput } from './infer/valueShape';
import SearchTagBar from './SearchTagBar';
import SearchTypeSelect from './SearchTypeSelect';
import SearchValueInput from './SearchValueInput';
import { useSearchCriteria } from './useSearchCriteria';
import { buildConditionTags } from './utils/buildConditionTags';
import { resolveFieldOptions, resolveValueKind } from './utils/searchItemUtils';
import { Button } from '@/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/tooltip';

export interface SearchBarProps {
  viewId: string;
  items: SearchPlaneItem[];
  // 逃生门:展开/收起完整条件面板
  onToggleAdvanced?: () => void;
  // 条件行右侧的插槽:由调用方挂载表格通用工具等
  tools?: React.ReactNode;
  // 高级筛选触发按钮的引用:供面板判定"点击触发按钮"不属于外部点击
  advancedTriggerRef?: React.Ref<HTMLButtonElement>;
}

// 文本形态:值由搜索条受控持有(推断需要零延迟),提交时以 override 传入
const TEXT_KINDS: SearchValueKind[] = ['text', 'number'];

/**
 * 统一搜索条:一个输入框完成「识别意图 + 提交条件」
 *
 * 交互要点:
 * - 类型来源:用户显式选择(锁定)优先,否则由输入内容实时推断
 * - 值承载:文本形态由本组件受控;日期/区间/枚举识别成功后写入草稿并锁定类型
 * - 条件落地:回车提交为 Tag,Tag 由 criteria 派生,可删除、可点击回填编辑
 */
const SearchBar: React.FC<SearchBarProps> = (props) => {
  const { viewId, items, onToggleAdvanced, tools, advancedTriggerRef } = props;
  const api = useSearchCriteria(viewId);
  const [lockedField, setLockedField] = useSafeState<string | undefined>(undefined);
  const [text, setText] = useSafeState('');
  const [error, setError] = useSafeState<string | undefined>(undefined);
  const [lowConfidence, setLowConfidence] = useSafeState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const inferred = useMemo(
    () => inferSearchType(text, items, { lockedField }),
    [text, items, lockedField],
  );
  const activeField = lockedField ?? inferred.field;
  const activeItem = items.find((item) => item.field === activeField);
  const activeKind = activeItem ? resolveValueKind(activeItem) : undefined;
  const tags = buildConditionTags(api.criteria, api.order, items, lowConfidence);

  // 识别出日期/区间/枚举时:把文本无损转成控件值并锁定类型,避免「识别成功却无处输入」
  useEffect(() => {
    if (lockedField || !activeItem || !text) {
      return;
    }
    const kind = resolveValueKind(activeItem);
    const field = activeItem.field;
    if (kind === 'dateRange') {
      const range = parseDateRangeInput(text);
      if (range) {
        api.setDraft(field, [range.start, range.end]);
        setLockedField(field);
        setText('');
      }
      return;
    }
    if (kind === 'date') {
      const date = parseDateInput(text);
      if (date) {
        api.setDraft(field, date);
        setLockedField(field);
        setText('');
      }
      return;
    }
    if (kind === 'enum') {
      const trimmed = text.trim();
      const hit = resolveFieldOptions(activeItem).find(
        (option) => option.label === trimmed || String(option.value) === trimmed,
      );
      if (hit) {
        api.setDraft(field, hit.value);
        setLockedField(field);
        setText('');
      }
    }
    // 仅依赖文本与推断结果:草稿变化不应重复触发类型切换
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, lockedField, activeItem]);

  const submit = useMemoizedFn(() => {
    if (!activeItem) {
      setError('请先选择要搜索的类型');
      return;
    }
    // 显式语法 `key:value` 只取 value 部分作为搜索值
    const typedValue = inferred.rule === 'typed' && isString(inferred.value) ? inferred.value : undefined;
    const override = activeKind && TEXT_KINDS.includes(activeKind) ? typedValue ?? text : undefined;
    const result = api.commit(activeItem.field, activeItem, override);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // 推断命中(非手动选择)的条件以弱化样式标记,便于用户发现识别偏差
    if (!lockedField && inferred.confidence === 'inferred') {
      setLowConfidence((prev) => (prev.includes(activeItem.field) ? prev : [...prev, activeItem.field]));
    }
    setError(undefined);
    setText('');
    setLockedField(undefined);
  });

  const selectType = useMemoizedFn((field: string) => {
    setLockedField(field);
    setError(undefined);
    // 切到文本类型时输入框本身不重挂,主动聚焦保持连续输入；
    // 切到日期/区间/枚举等专用控件时由 SearchValueInput 负责把焦点交给新控件
    requestAnimationFrame(() => inputRef.current?.focus());
  });

  // Esc 解除类型锁定,把文本交还用户
  const onEscape = useMemoizedFn(() => {
    setError(undefined);
    setLockedField(undefined);
  });

  // 输入区为空时退格:移除最后一条条件
  const onBackspaceEmpty = useMemoizedFn(() => {
    const last = tags[tags.length - 1];
    if (!last) {
      return;
    }
    api.removeCondition(last.field);
    if (lockedField === last.field) {
      setLockedField(undefined);
    }
  });

  const onEditTag = useMemoizedFn((field: string) => {
    const loaded = api.loadToDraft(field);
    setLockedField(field);
    setError(undefined);
    const item = items.find((each) => each.field === field);
    const kind = item ? resolveValueKind(item) : 'text';
    if (kind === 'text' || kind === 'number') {
      setText(loaded === undefined || loaded === null ? '' : String(loaded));
      inputRef.current?.focus();
    }
  });

  // 重置:清空已生效条件,并同步清空输入区与类型锁定
  const onReset = useMemoizedFn(() => {
    api.resetAll();
    setText('');
    setLockedField(undefined);
    setError(undefined);
    setLowConfidence([]);
  });

  const hint = error
    ?? (inferred.confidence === 'inferred' && !lockedField && activeItem
      ? '已识别为「' + activeItem.title + '」，回车确认'
      : undefined);

  return (
    // 单行布局：左侧搜索框、中间条件 Tag、右侧表格工具三段对齐在同一行；
    // 窄屏放不下时整段换行，不做横向滚动
    <div className="search-bar flex flex-wrap items-center gap-x-3 gap-y-2">
      {/* 搜索框：紧凑一体条——外层不再套定位容器，高度取常规输入框高度，
          内部控件各自去边框，整体只留一圈边框。窄屏占满一行，宽屏定宽以免把 Tag 挤没。
          宽度按「类型图标/字段名 + 占位文案完整显示 + 搜索图标」收敛，不按最长输入预留。
          聚焦只加深边框、不加外发光，与表单输入框保持一致的焦点表现 */}
      <div className="search-box flex h-9 w-full shrink-0 items-center gap-1 rounded-md border bg-card pl-1 focus-within:border-ring/60 @min-[56rem]/search:w-[440px]">
        <SearchTypeSelect
          items={items}
          value={activeField}
          unresolved={!activeField}
          onSelect={selectType}
        />
        {/* 输入区只保留一个挂载点：未识别类型与已识别文本类型渲染的是同一棵子树，
            否则输入第一个字符触发类型推断时节点会被重建，焦点掉到 body */}
        <SearchValueInput
          reqId={api.reqId}
          item={activeItem}
          kind={activeKind}
          text={text}
          error={error}
          inputRef={inputRef}
          onTextChange={(next) => {
            setText(next);
            setError(undefined);
          }}
          onSubmit={submit}
          onEscape={onEscape}
          onBackspaceEmpty={onBackspaceEmpty}
        />
        {/* 搜索：只留图标、无底色。用 ghost 而非默认实心主色——
            页面上的黑色实心按钮是「行动召唤」的语义，搜索框里的提交不该抢同一个视觉层级。
            高度铺满搜索框、左侧不留圆角，与输入框外边框严丝合缝。
            焦点态交给搜索框的 focus-within 边框，避免 3px 焦点环溢出框外 */}
        <Button
          variant="ghost"
          aria-label="搜索"
          className="h-full w-9 shrink-0 rounded-l-none px-0 focus-visible:ring-0"
          onClick={submit}
        >
          <Search />
        </Button>
      </div>

      {/* 中间：识别提示（输入反馈）与已生效条件。提示为空时整段不占位，
          条件由 criteria 派生，「清空条件」就在其中 */}
      <div className="flex min-w-0 flex-1 items-center">
        <span className="text-muted-foreground mr-2 shrink-0 text-xs whitespace-nowrap empty:hidden" aria-live="polite">{hint}</span>
        <div className="min-w-0 flex-1">
          <SearchTagBar
            tags={tags}
            onRemove={api.removeCondition}
            onEdit={onEditTag}
            onClearAll={onReset}
          />
        </div>
      </div>

      {/* 右侧工具：高级筛选 + 调用方挂载的表格通用工具（列设置/全屏/下载）。
          不再提供「重置」：条件区的「清空条件」已经承担同一职责 */}
      <div className="flex shrink-0 items-center gap-1">
        {onToggleAdvanced && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={advancedTriggerRef}
                variant="outline"
                size="icon-sm"
                aria-label="高级筛选"
                onClick={onToggleAdvanced}
              >
                <SlidersHorizontal />
              </Button>
            </TooltipTrigger>
            <TooltipContent>展开全部搜索条件</TooltipContent>
          </Tooltip>
        )}
        {tools}
      </div>
    </div>
  );
};

export default SearchBar;