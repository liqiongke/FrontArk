import { floor, isArray } from 'lodash';
import { SearchPlaneFormProps } from './interface';
import { Col, Row } from 'antd';
import SearchPanelItem from './SearchPanelItem';
import SearchPanelTools from './SearchPanelTools';

const SearchPanelForm: React.FC<SearchPlaneFormProps> = (props) => {
  const { viewId, items, colNum = 6 } = props;
  const colSize = floor(24 / colNum);

  if (!isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <Row className="search-panel-form" gutter={[12, 6]}>
      {items.map((item, index) => (
        <Col key={index + '_' + item.field} span={colSize}>
          <SearchPanelItem viewId={viewId} item={item} />
        </Col>
      ))}
      <Col key="tools" span={colSize}>
        <SearchPanelTools />
      </Col>
    </Row>
  );
};

export default SearchPanelForm;
