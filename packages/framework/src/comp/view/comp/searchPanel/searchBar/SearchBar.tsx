import { useSafeState, useMemoizedFn } from 'ahooks';
import { isString } from 'lodash';
import { useEffect, useMemo, useRef } from 'react';
import { RotateCcw, Search, SlidersHorizontal } from 'lucide-react';

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
import { Input } from '@/ui/components/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/tooltip';

export interface SearchBarProps {
  viewId: string;
  items: SearchPlaneItem[];
  // 逃生门:切换到完整搜索面板
  onToggleAdvanced?: () => void;
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
  const { viewId, items, onToggleAdvanced } = props;
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
    // 类型切换会重挂值区控件,主动把焦点交回输入框,保持连续输入
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
    <div className="search-bar">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card px-2 py-1.5 focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]">
        <SearchTypeSelect
          items={items}
          value={activeField}
          unresolved={!activeField}
          onSelect={selectType}
        />
        {activeItem && api.reqId && activeKind && (
          <SearchValueInput
            reqId={api.reqId}
            item={activeItem}
            kind={activeKind}
            text={TEXT_KINDS.includes(activeKind) ? text : undefined}
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
        )}
        {!activeItem && (
          // 未识别到类型时仍保留输入框:文本不丢,用户可从左侧下拉补选类型
          <Input
            ref={inputRef}
            aria-label="搜索内容"
            className="min-w-0 flex-1 border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            placeholder="输入单号、名称、日期等，系统会自动判断搜索类型"
            value={text}
            aria-invalid={!!error}
            onChange={(event) => {
              setText(event.target.value);
              setError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
                return;
              }
              if (event.key === 'Escape') {
                onEscape();
                return;
              }
              if (event.key === 'Backspace' && !event.currentTarget.value) {
                onBackspaceEmpty();
              }
            }}
          />
        )}
        <Button aria-label="搜索" onClick={submit}>
          <Search />
          搜索
        </Button>
        <Button variant="ghost" aria-label="重置" onClick={onReset}>
          <RotateCcw />
          重置
        </Button>
        {onToggleAdvanced && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" aria-label="高级筛选" onClick={onToggleAdvanced}>
                <SlidersHorizontal />
                高级筛选
              </Button>
            </TooltipTrigger>
            <TooltipContent>展开完整搜索面板</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="min-h-5 px-1 pt-1 text-xs text-muted-foreground" aria-live="polite">
        {hint}
      </div>
      <SearchTagBar
        tags={tags}
        onRemove={api.removeCondition}
        onEdit={onEditTag}
        onClearAll={onReset}
      />
    </div>
  );
};

export default SearchBar;