import { type SearchPlaneItem, type SearchValueKind } from '../interface';
import { buildValueCtrl } from './utils/searchItemUtils';
import CtrlFactory from '@/comp/ctrlFactory';
import { PathKey, type DPath } from '@/stores/store/interface';
import { useMemoizedFn } from 'ahooks';
import { type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';
import { Input } from '@/ui/components/input';

// 草稿区在请求节点下的字段名,与 useSearchCriteria 保持一致
const DRAFT_KEY = 'searchDraft';

export interface SearchValueInputProps {
  reqId: string;
  // 当前激活字段(推断或手动选择的结果)
  item: SearchPlaneItem;
  kind: SearchValueKind;
  // 文本形态的受控值;非文本形态为 undefined,由 store 草稿驱动
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

// 文本形态由父组件受控持有(推断需要零延迟),其余形态复用 Ctrl 控件与 store 草稿
const TEXT_KINDS: SearchValueKind[] = ['text', 'number'];

const SearchValueInput: React.FC<SearchValueInputProps> = (props) => {
  const { reqId, item, kind, text, onTextChange, onSubmit, onEscape, onBackspaceEmpty, inputRef, error } = props;
  const path: DPath = [PathKey.Req, reqId, DRAFT_KEY, item.field];
  const isText = TEXT_KINDS.includes(kind);

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

  if (!isText) {
    return (
      <div className="search-value-input min-w-0 flex-1" data-slot="search-value-input">
        <CtrlFactory ctrl={buildValueCtrl(item, kind)} path={path} />
      </div>
    );
  }

  return (
    <div className="search-value-input min-w-0 flex-1">
      <Input
        ref={inputRef}
        aria-label={'按' + item.title + '搜索'}
        className="border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        placeholder={item.example ?? '支持单号/名称关键字，或按右侧箭头选择类型'}
        value={text ?? ''}
        aria-invalid={!!error}
        onChange={onInputChange}
        onKeyDown={onKeyDown}
      />
    </div>
  );
};

export default SearchValueInput;
