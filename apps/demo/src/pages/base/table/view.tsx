import { Ctrl, DataBase, RenderMode, SummaryType, VType, ViewBase, type VProps } from '@jl/framework';
import type Data from './data';
import type Handler from './handler';

// 搜索下拉的选项需与 mock 数据取值一致
const toOptions = (labels: string[]) => labels.map((label) => ({ label, value: label }));

const CATEGORY_OPTIONS = toOptions(['手机数码', '家电', '服装', '图书', '运动户外', '美妆个护']);

const STATUS_OPTIONS = toOptions(['在售', '缺货', '下架']);

class View extends ViewBase<Handler, Data> {
  table1: VProps.Table = {
    id: 'table1',
    type: VType.Table,
    dataId: this.data.mainTable.id,
    // 启用结构订阅模式:字段编辑仅更新对应控件,不再带动表格外壳更新
    // (本页无本地排序/过滤/行选择依赖;行键缺失/重复/非字符串时框架自动回退经典模式)
    renderMode: RenderMode.Subscription,
    // 搜索项同时服务两种模式:
    // simple 模式按 valueKind/keywords/regExp 推断类型并切换输入控件
    // advanced 模式按 ctrl 渲染完整表单
    searchItems: [
      {
        title: '产品ID',
        field: 'id',
        keywords: ['编号', '产品编号'],
        valueKind: 'text',
        regExp: /^PRD\d+$/i,
        match: 'exact',
        example: 'PRD001',
      },
      {
        title: '产品名称',
        field: 'name',
        keywords: ['品名', '名称'],
        valueKind: 'text',
        example: '产品名称关键字',
        // 未识别到类型时的兜底字段
        primary: true,
      },
      { title: '价格', field: 'price', keywords: ['金额', '单价'], valueKind: 'number', match: 'range' },
      {
        title: '产品类别',
        field: 'category',
        keywords: ['分类', '类别'],
        valueKind: 'enum',
        operator: 'or',
        ctrl: { type: Ctrl.Select, items: CATEGORY_OPTIONS },
      },
      {
        title: '状态',
        field: 'status',
        keywords: ['单据状态', '状态'],
        valueKind: 'enum',
        ctrl: { type: Ctrl.Select, items: STATUS_OPTIONS },
      },
      {
        title: '创建时间',
        field: 'createTime',
        keywords: ['日期', '时间', '创建日期'],
        valueKind: 'dateRange',
        ctrl: { type: Ctrl.DateRange, format: 'YYYY-MM-DD' },
      },
    ],
    items: [
      { title: '产品ID', field: 'id' },
      { title: '产品名称', field: 'name' },
      { title: '价格', field: 'price' },
      { title: '产品类别', field: 'category' },
      { title: '品牌', field: 'brand' },
      { title: '库存', field: 'stock' },
      { title: '状态', field: 'status' },
      { title: '销量', field: 'sales' },
      { title: '评分', field: 'rating' },
      { title: '颜色', field: 'color' },
      { title: '保修期', field: 'warranty' },
      { title: '创建时间', field: 'createTime' },
    ],
    // 服务端分页:分页参数写入数据节点 criteria 后重新请求,页码/总数取自响应体的 @pagination
    // 后端未返回 @pagination 时整条分页不渲染,因此这份配置对不支持的接口无害
    pagination: {
      // 字段名需与后端约定一致(本 mock 读 page/pageSize)
      pageField: 'page',
      pageSizeField: 'pageSize',
      pageSizeOptions: [10, 20, 50],
    },
    // 底部统计行:统计哪些列、用什么方式统计都在这里声明,不配置则不渲染
    // 数据来源是表格全量数据(含未进入虚拟窗口的行),字段编辑后自动重算
    summaryText: '合计',
    summaryItems: [
      // 内置统计方式:sum/avg/count/max/min;formatter 仅作用于内置方式的数值展示
      { field: 'price', type: SummaryType.Sum, formatter: (value) => `¥${value}` },
      { field: 'stock', type: SummaryType.Sum },
      { field: 'sales', type: SummaryType.Sum },
      { field: 'rating', type: SummaryType.Avg },
      // 自定义统计函数:入参为该列数值集合与全部行,可返回任意展示内容
      {
        field: 'status',
        summary: (_values, rows) =>
          `${rows.filter((row) => row.status === '在售').length} 个在售`,
      },
    ],
  };

  form1: VProps.Form = {
    id: 'form1',
    type: VType.Form,
    // 本页表单不显示外层卡片边框
    bordered: false,
    // 绑定 table1 的焦点行:字段路径解析为 [table, 焦点行下标, field],读取与回写都落在焦点行数据上
    // 表单按 path 取数(ViewForm 不消费 dataId),且 @Active: 引用必须指向视图 id 而非数据节点 id
    path: [DataBase.active(this.table1.id)],
    items: [
      { title: '价格', field: 'price' },
      { title: '产品类别', field: 'category' },
      { title: '品牌', field: 'brand' },
      { title: '库存', field: 'stock' },
    ],
    toolList: [
      {
        type: Ctrl.Button,
        variant: 'outline',
        text: '打印数据',
        onClick: this.handler.onPrintData,
      },
      {
        type: Ctrl.Button,
        variant: 'outline',
        text: '设置数据',
        onClick: this.handler.onSetData,
      },
      {
        type: Ctrl.Button,
        variant: 'outline',
        text: '查看读取统计',
        onClick: this.handler.printDataStats,
      },
      {
        type: Ctrl.Button,
        variant: 'outline',
        text: '重置读取统计',
        onClick: this.handler.resetDataStats,
      },
      {
        type: Ctrl.Button,
        variant: 'outline',
        text: 'POST请求',
        onClick: this.handler.btnPostReqData,
      },
      {
        type: Ctrl.Button,
        variant: 'outline',
        text: 'GET请求',
        onClick: this.handler.btnGetReqData,
      },
    ],
  };

  layout: VProps.Flex = {
    id: 'layout',
    type: VType.LayoutFlex,
    gutter: 24,
    items: [this.form1.id, this.table1.id],
  };

  getRootId = () => this.layout.id;
}

export default View;
