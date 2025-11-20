import { get, isUndefined } from 'lodash';
import CtrlButton from './control/button/ctrlButton';
import CtrlInput from './control/input/ctrlInput';
import { CtrlStructType, CtrlType, SysCtrlProps } from './control/interface';
import CtrlText from './control/text/ctrlText';
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
