import { SearchOutlined, UndoOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { FC } from 'react';
import './index.less';

export interface SearchPanelToolsProps {
  /** 搜索按钮点击事件 */
  onSearch?: () => void;
  /** 撤回按钮点击事件 */
  onReset?: () => void;
}

// 搜索面板工具组件
const SearchPanelTools: FC<SearchPanelToolsProps> = (props) => {
  const { onSearch, onReset } = props;

  return (
    <div className="search-panel-tools">
      <Button onClick={onSearch} type="primary" shape="circle" icon={<SearchOutlined />} />
      <Button onClick={onReset} shape="circle" icon={<UndoOutlined />} />
    </div>
  );
};

export default SearchPanelTools;
