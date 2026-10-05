import { get, isArray } from 'lodash';
import { Download, Maximize2, Minimize2 } from 'lucide-react';
import React, { useCallback, useEffect } from 'react';
import { useData } from '@/stores/store/hooks/useValue';
import { type DPath } from '@/stores/store/interface';
import { Button } from '@/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/tooltip';
import { useSafeState } from 'ahooks';
import ColumnSettings from './columnSettings';
import { type ColumnSettingsProps, type TableColumn, type TableToolsConfig } from '../interface';

/** 转义单个 CSV 字段：含分隔符/引号/换行时加引号，内部引号翻倍 */
const escapeCsvField = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * 按列配置把行数据导出为 CSV 文本。
 * 用 CRLF 换行并交由下载侧补 BOM，保证 Excel 打开中文不乱码。
 */
export const buildCsv = (
  columns: Array<Pick<TableColumn, 'title' | 'dataIndex'>>,
  rows: unknown[],
): string => {
  const header = columns.map((column) => escapeCsvField(column.title)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvField(get(row as object, column.dataIndex))).join(','),
  );
  return [header, ...body].join('\r\n');
};

/** 触发浏览器下载（前置 BOM 供 Excel 识别 UTF-8） */
export const downloadCsv = (csv: string, fileName: string) => {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export interface TableToolsProps {
  /** 表格列：决定导出表头、字段顺序与格式（只含展示中的列） */
  columns: TableColumn[];
  /** 表格数据路径：导出当前已加载的数据 */
  dataPath?: DPath;
  /** 全屏目标元素（表格所在的面板） */
  fullscreenTargetRef?: React.RefObject<HTMLElement | null>;
  /** 功能开关与导出文件名 */
  config?: TableToolsConfig;
  /** 列设置：不传则不渲染列设置入口 */
  columnSettings?: ColumnSettingsProps;
}

/**
 * 表格通用工具：列设置、全屏显示、下载数据
 *
 * 全屏走浏览器 Fullscreen API（对表格所在的面板生效，保留面板内边距与滚动结构）；
 * 下载导出当前已加载的数据为 CSV——服务端分页时即当前页，
 * 需要导出全量数据应由业务侧接后端导出接口。
 */
const TableTools: React.FC<TableToolsProps> = (props) => {
  const { columns, dataPath, fullscreenTargetRef, config, columnSettings } = props;
  const showFullscreen = config?.fullscreen ?? true;
  const showDownload = config?.download ?? true;
  // 列数少于 2 时既没有顺序也没用可见性可调，不渲染入口
  const showColumnSettings = (config?.columns ?? true) && !!columnSettings && columnSettings.allColumns.length >= 2;
  const [fullscreen, setFullscreen] = useSafeState(false);
  const data = useData(dataPath);

  // 全屏状态以浏览器为准：用户按 Esc 退出时按钮状态要跟着回来
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    onChange();
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [setFullscreen]);

  const toggleFullscreen = useCallback(() => {
    const target = fullscreenTargetRef?.current;
    if (!target) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void target.requestFullscreen?.();
  }, [fullscreenTargetRef]);

  const onDownload = useCallback(() => {
    const rows = isArray(data) ? data : [];
    if (rows.length === 0) {
      return;
    }
    const baseName = config?.exportFileName ?? 'table';
    downloadCsv(buildCsv(columns, rows), `${baseName}`);
  }, [columns, data, config?.exportFileName]);

  if (!showFullscreen && !showDownload && !showColumnSettings) {
    return null;
  }

  return (
    <div className="view-table-tools flex items-center gap-1">
      {showColumnSettings && columnSettings && <ColumnSettings {...columnSettings} />}
      {showFullscreen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              // 只显示图标：文案交给 aria-label 与 tooltip，避免工具区占宽
              size="icon-sm"
              aria-label={fullscreen ? '退出全屏' : '全屏显示'}
              aria-pressed={fullscreen}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{fullscreen ? '退出全屏显示' : '全屏显示表格'}</TooltipContent>
        </Tooltip>
      )}
      {showDownload && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="下载数据"
              disabled={!isArray(data) || data.length === 0}
              onClick={onDownload}
            >
              <Download />
            </Button>
          </TooltipTrigger>
          <TooltipContent>下载当前已加载的数据（CSV）</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

export default TableTools;
