import { type SearchPlaneItem, type SearchValueKind } from '../interface';
import { buildValueCtrl } from './utils/searchItemUtils';
import CtrlFactory from '@/comp/ctrlFactory';
import { PathKey, type DPath } from '@/stores/store/interface';
import { useMemoizedFn } from 'ahooks';
import { type ChangeEvent, type KeyboardEvent, type RefObject, useEffect, useRef } from 'react';
import { Input } from '@/ui/components/input';

// 草稿区在请求节点下的字段名,与 useSearchCriteria 保持一致
const DRAFT_KEY = 'searchDraft';

// 文本形态由父组件受控持有(推断需要零延迟),其余形态复用 Ctrl 控件与 store 草稿
const TEXT_KINDS: SearchValueKind[] = ['text', 'number'];

export interface SearchValueInputProps {
  reqId?: string;
  // 当前激活字段(推断或手动选择的结果);未识别到类型时为 undefined
  item?: SearchPlaneItem;
  // 值形态;未识别到类型时为 undefined,按文本形态渲染
  kind?: SearchValueKind;
  // 文本形态的受控值;非文本形态不使用,由 store 草稿驱动
  text?: string;
  onTextChange?: (text: string) => void;
  onSubmit?: () => void;
  onEscape?: () => void;
  // 输入区为空时按退格:删除最后一条条件
  onBackspaceEmpty?: () => void;
  // 文本输入框引用,供 Tag 编辑后回填聚焦
  inputRef?: RefObject<HTMLInputElement | null>;
  // 校验失败提示
  error?: string;
}

/**
 * 搜索值输入区
 *
 * 关键约束：**未识别类型时必须渲染同一个输入框节点**。
 * 用户敲下第一个字符就会触发类型推断；若此时把「无类型的输入框」换成「有类型的输入框」，
 * 即使两处都用 Input，只要外层结构不同（有没有包裹层）React 也会卸载旧节点、挂载新节点，
 * 焦点随之掉到 body——表现就是「输入一个字符就失去焦点」。
 * 因此默认形态与文本/数字形态共用同一棵子树，只有形态真正变成日期/区间/枚举控件时才换节点，
 * 换节点后主动把焦点交回新控件；Esc 解除类型锁定退回文本时同理，焦点回到输入框。
 */
const SearchValueInput: React.FC<SearchValueInputProps> = (props) => {
  const {
    reqId,
    item,
    kind,
    text,
    onTextChange,
    onSubmit,
    onEscape,
    onBackspaceEmpty,
    inputRef,
    error,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  // 未识别到类型（kind 为空）也走文本形态
  const isTextKind = kind === undefined || TEXT_KINDS.includes(kind);
  const draftPath: DPath | undefined =
    reqId && item ? [PathKey.Req, reqId, DRAFT_KEY, item.field] : undefined;
  // 只有形态确实是专用控件、且字段与请求节点齐备时才渲染控件；
  // 否则一律退回文本输入框（宁可退化也不能没有输入框）
  const valueControl =
    !isTextKind && item && draftPath ? { item, kind: kind as SearchValueKind, path: draftPath } : undefined;
  const hasValueControl = valueControl !== undefined;
  const wasControlRef = useRef(hasValueControl);

  useEffect(() => {
    // 形态没变则不干预焦点（首帧、以及文本形态内部的推断切换都不会触发）
    if (wasControlRef.current === hasValueControl) {
      return;
    }
    wasControlRef.current = hasValueControl;
    if (hasValueControl) {
      // 换成了日期/区间/枚举控件：把焦点交给新控件的可聚焦元素
      containerRef.current
        ?.querySelector<HTMLElement>(
          'input:not([type="hidden"]), button, [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
      return;
    }
    // 退回文本形态：焦点交回输入框，用户可以接着打字
    inputRef?.current?.focus();
  }, [hasValueControl, inputRef]);

  const onInputChange = useMemoizedFn((event: ChangeEvent<HTMLInputElement>) => {
    // 文本形态的值由父组件受控持有(推断需要零延迟),提交时以 override 传入,不写 store
    onTextChange?.(event.target.value);
  });

  const onKeyDown = useMemoizedFn((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit?.();
      return;
    }
    if (event.key === 'Escape') {
      onEscape?.();
      return;
    }
    // 输入区已空时的退格:删除最后一条条件
    if (event.key === 'Backspace' && !event.currentTarget.value) {
      onBackspaceEmpty?.();
    }
  });

  return (
    <div
      ref={containerRef}
      className="search-value-input min-w-0 flex-1"
      data-slot="search-value-input"
    >
      {valueControl ? (
        <CtrlFactory ctrl={buildValueCtrl(valueControl.item, valueControl.kind)} path={valueControl.path} />
      ) : (
        <Input
          ref={inputRef}
          aria-label={item ? '按' + item.title + '搜索' : '搜索内容'}
          className="h-8 border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          placeholder={item?.example}
          value={text ?? ''}
          aria-invalid={!!error}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
        />
      )}
    </div>
  );
};

export default SearchValueInput;
