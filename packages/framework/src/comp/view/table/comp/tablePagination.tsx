import { get, isNumber, isObject, isString } from 'lodash';
import React, { useContext } from 'react';
import { readReqNodeId } from '@/stores/store/utils/storeDataPath';
import StoreContext from '@/stores/store/storeContext';
import { type DPath, PathKey } from '@/stores/store/interface';
import { useReq } from '@/stores/store/hooks/useReq';
import { useReqMeta } from '@/stores/store/hooks/useReqMeta';
import Pagination from '@/ui/components/pagination';
import { type TablePaginationConfig, type TablePaginationInfo } from '../interface';

/** 请求字段名默认值与后端约定保持一致 */
const DEFAULT_PAGE_FIELD = 'page';
const DEFAULT_PAGE_SIZE_FIELD = 'pageSize';

/**
 * 从响应元信息里解析分页信息。
 * 三个必需字段缺一或类型不对，都视为后端未提供分页（此时不渲染分页条）。
 */
export const readPaginationInfo = (responseParams: unknown): TablePaginationInfo | undefined => {
  if (!isObject(responseParams)) {
    return undefined;
  }
  const current = get(responseParams, 'current');
  const pageSize = get(responseParams, 'pageSize');
  const total = get(responseParams, 'total');
  if (!isNumber(current) || !isNumber(pageSize) || !isNumber(total)) {
    return undefined;
  }
  return { current, pageSize, total };
};

interface TablePaginationProps {
  /** 所属表格视图 id */
  viewId: string;
  /** 分页配置（字段名/每页条数候选） */
  config: TablePaginationConfig;
}

/**
 * 表格底部分页条
 *
 * 服务端分页：翻页就是把页码/每页条数写进数据节点的 criteria 并重新请求。
 * 当前页与总数以响应体的 `@pagination` 为准，请求进行中禁用交互，避免连点造成竞态。
 */
const TablePagination: React.FC<TablePaginationProps> = (props) => {
  const { viewId, config } = props;
  const useStore = useContext(StoreContext);
  const reqId = useStore((state) => readReqNodeId(state, viewId));
  const setData = useStore((state) => state.setData);
  const [, sendReq] = useReq(viewId);
  const meta = useReqMeta(viewId);

  const pagination = readPaginationInfo(meta?.responseParams);
  // 未拿到分页信息（后端未返回）时整条不渲染，避免出现无意义的空分页条
  if (!isString(reqId) || !pagination) {
    return null;
  }

  const pageField = config.pageField ?? DEFAULT_PAGE_FIELD;
  const pageSizeField = config.pageSizeField ?? DEFAULT_PAGE_SIZE_FIELD;
  const writeCriteria = (field: string, value: number) => {
    setData([PathKey.Req, reqId, 'criteria', field] as DPath, value);
  };

  const onPageChange = (page: number) => {
    writeCriteria(pageField, page);
    sendReq();
  };

  const onPageSizeChange = (pageSize: number) => {
    // 每页条数变化后原页码可能越界，统一回到第一页
    writeCriteria(pageSizeField, pageSize);
    writeCriteria(pageField, 1);
    sendReq();
  };

  return (
    <Pagination
      // 与表格工具的间距由所属底部行统一负责，自身不再叠加外边距
      className="min-w-0"
      current={pagination.current}
      pageSize={pagination.pageSize}
      total={pagination.total}
      pageSizeOptions={config.pageSizeOptions}
      disabled={meta?.status === 'pending'}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  );
};

export default TablePagination;
