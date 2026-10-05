import { useSafeState, useMemoizedFn } from 'ahooks';
import { isArray, isString } from 'lodash';
import { useEffect, useMemo, useRef } from 'react';
import { RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';

import { type SearchConditionTag, type SearchPlaneItem, type SearchValueKind } from '../interface';
import { inferSearchType } from './infer/inferSearchType';
import { parseDateInput, parseDateRangeInput } from './infer/valueShape';
import SearchTagBar from './SearchTagBar';
import SearchTypeSelect from './SearchTypeSelect';
import SearchValueInput from './SearchValueInput';
import { useSearchCriteria } from './useSearchCriteria';
import { buildConditionTags } from './utils/buildConditionTags';
import { formatSearchValue, isEmptySearchValue, resolveFieldOptions, resolveValueKind } from './utils/searchItemUtils';
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
 * 回填到输入框的文本:多值原样拼成 'A,B'
 * 与 Tag 上的展示文本同源,用户删掉其中一段再回车,就等于从条件里去掉那个值
 */
const toInputText = (kind: SearchValueKind, tag: SearchConditionTag | undefined) =>
  tag ? formatSearchValue(kind, tag.value) : '';

/**
 * 统一搜索条:一个输入框完成「识别意图 + 提交条件」
 *
 * 交互要点:
 * - 类型来源:用户显式选择(锁定)优先,否则由输入内容实时推断
 * - 值承载:文本形态由本组件受控;日期/区间/枚举识别成功后写入草稿并锁定类型
 * - 条件落地:回车提交为 Tag,Tag 由 criteria 派生,可删除、可点击回填编辑
 * - 回填编辑:点 Tag 把整条条件(多值以逗号并列)搬进输入框,回车是「替换」而不是追加;
 *   删掉其中一段再回车即从条件里去掉该值,输入框右侧的叉号可一键清空输入区
 */
const SearchBar: React.FC<SearchBarProps> = (props) => {
  const { viewId, items, onToggleAdvanced, tools, advancedTriggerRef } = props;
  const api = useSearchCriteria(viewId);
  const [lockedField, setLockedField] = useSafeState<string | undefined>(undefined);
  // 正在编辑的已生效条件:由点击 Tag 回填进入,回车提交时改为「整体替换」而不是追加多值
  const [editField, setEditField] = useSafeState<string | undefined>(undefined);
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
  // 输入框里是否有可清空的内容:文本形态看文本,日期/区间/枚举看草稿值
  const draftValue = activeField ? api.draft?.[activeField] : undefined;
  const canClear = text !== ''
    || (!!lockedField && !isEmptySearchValue(activeKind ?? 'text', draftValue));

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
    // 回填编辑:这次输入就是该条件的最终值(可删掉其中一段);其余场景为追加多值
    const editing = editField === activeItem.field;
    const editingTag = editing ? tags.find((each) => each.field === activeItem.field) : undefined;
    // 数字里不可能有逗号,逗号恒为多值分隔符;
    // 文本只有「原条件本来就是多值」时才拆 —— 单值文本里的逗号是内容的一部分
    const split = activeKind === 'number' || (!!editingTag && isArray(editingTag.value));
    const result = api.commit(activeItem.field, activeItem, override, {
      mode: editing ? 'replace' : 'merge',
      split,
    });
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
    setEditField(undefined);
  });

  const selectType = useMemoizedFn((field: string) => {
    setLockedField(field);
    // 手动换类型 = 新加一条条件,不再承接上一次的回填编辑
    setEditField(undefined);
    setError(undefined);
    // 切到文本类型时输入框本身不重挂,主动聚焦保持连续输入；
    // 切到日期/区间/枚举等专用控件时由 SearchValueInput 负责把焦点交给新控件
    requestAnimationFrame(() => inputRef.current?.focus());
  });

  // Esc 解除类型锁定,把文本交还用户
  const onEscape = useMemoizedFn(() => {
    setError(undefined);
    setLockedField(undefined);
    setEditField(undefined);
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
    setEditField(undefined);
  });

  // 点击 Tag 回填:整条条件搬进输入框编辑,多值以逗号并列显示
  const onEditTag = useMemoizedFn((field: string) => {
    const item = items.find((each) => each.field === field);
    const kind = item ? resolveValueKind(item) : 'text';
    api.loadToDraft(field, kind);
    setLockedField(field);
    setEditField(field);
    setError(undefined);
    if (TEXT_KINDS.includes(kind)) {
      setText(toInputText(kind, tags.find((each) => each.field === field)));
      inputRef.current?.focus();
    }
  });

  // 清空输入区:文本与草稿一起清掉,保留当前类型以便继续输入
  const onClearInput = useMemoizedFn(() => {
    if (lockedField) {
      api.clearDraft(lockedField);
    }
    setText('');
    setError(undefined);
    inputRef.current?.focus();
  });

  // 重置:清空已生效条件,并同步清空输入区与类型锁定
  const onReset = useMemoizedFn(() => {
    api.resetAll();
    setText('');
    setLockedField(undefined);
    setEditField(undefined);
    setError(undefined);
    setLowConfidence([]);
  });

  // 只在提交失败时提示：识别结果已经由输入框左侧的类型标签给出，
  // 再补一句「已识别为 XX」是重复信息，反而把条件区挤窄
  const hint = error;

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
        {/* 清空输入区：只在真的有内容可清时出现，紧贴搜索图标左侧。
            回填编辑 Tag 时最常用——删掉其中一段值即可改条件，
            整段不要就在这里一键清掉，不必先全选删字 */}
        {canClear && (
          <Button
            variant="ghost"
            aria-label="清空搜索内容"
            className="h-full w-8 shrink-0 px-0 text-muted-foreground hover:text-foreground focus-visible:ring-0"
            onClick={onClearInput}
          >
            <X />
          </Button>
        )}
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

      {/* 中间：提交失败提示与已生效条件。提示为空时整段不占位，条件由 criteria 派生 */}
      <div className="flex min-w-0 flex-1 items-center">
        <span className="text-muted-foreground mr-2 shrink-0 text-xs whitespace-nowrap empty:hidden" aria-live="polite">{hint}</span>
        <div className="min-w-0 flex-1">
          <SearchTagBar tags={tags} onRemove={api.removeCondition} onEdit={onEditTag} />
        </div>
      </div>

      {/* 右侧工具：清空条件（仅有条件时出现）+ 高级筛选 + 调用方挂载的表格通用工具（列设置/全屏/下载）。
          「清空条件」收敛为图标：文案按钮放在条件末尾会随 Tag 数量左右漂移，
          固定在工具区则始终停在同一个位置上 */}
      <div className="flex shrink-0 items-center gap-1">
        {tags.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="清空条件"
                onClick={onReset}
              >
                <RotateCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>清空全部搜索条件</TooltipContent>
          </Tooltip>
        )}
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