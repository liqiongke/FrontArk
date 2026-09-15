import { DownOutlined, SearchOutlined } from '@ant-design/icons';
import { Dropdown, Space } from 'antd';
import { isArray } from 'lodash';
import { type FC, useMemo } from 'react';
import './index.less';
import { type SearchPlaneSelectProps } from './interface';
import CtrlFactory from '@/comp/ctrlFactory';

// 通用的搜索面板
const SearchPanelSelect: FC<SearchPlaneSelectProps> = (props) => {
  const { items } = props;

  const options = useMemo(() => {
    if (!isArray(items)) {
      return [];
    }
    return items.map((item) => ({
      label: item.title,
      key: item.field,
    }));
  }, [items]);

  if (!isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <div className="search-panel-select">
      <div className="title">
        <Dropdown menu={{ items: options }}>
          <a onClick={(e) => e.preventDefault()}>
            <Space>
              选择类型
              <DownOutlined />
            </Space>
          </a>
        </Dropdown>
      </div>
      <div className="content">
        <CtrlFactory />
      </div>
      <div className="btn">
        <SearchOutlined />
      </div>
    </div>
  );
};

export default SearchPanelSelect;
