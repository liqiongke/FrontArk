import { get, isUndefined } from 'lodash';
import CtrlButton from '@ctrl/button/ctrlButton';
import CtrlInput from '@ctrl/input/ctrlInput';
import CtrlText from '@ctrl/text/ctrlText';
import { CtrlStructType, CtrlType, SysCtrlProps } from '@ctrl/interface';
import React from 'react';

// 组件映射
const CtrlTypeMap = new Map<string, React.FC<any>>([
  [CtrlType.CTRL_TEXT, CtrlText],
  [CtrlType.CTRL_BUTTON, CtrlButton],
  [CtrlType.CTRL_INPUT, CtrlInput],
]);

const CtrlFactory: React.FC<SysCtrlProps<CtrlStructType>> = (props) => {
  const type = get(props, 'ctrl.type', CtrlType.CTRL_TEXT);
  let comp = CtrlTypeMap.get(type);
  if (isUndefined(comp)) {
    comp = CtrlText;
  }
  return React.createElement(comp, props);
};

export default CtrlFactory;
