import CtrlButton from '@ctrl/button/ctrlButton';
import CtrlInput from '@ctrl/input/ctrlInput';
import { Ctrl, CtrlStructType, SysCtrlProps } from '@ctrl/interface';
import CtrlText from '@ctrl/text/ctrlText';
import { get, isUndefined } from 'lodash';
import React from 'react';
import CtrlCheckbox from './control/checkbox/ctrlCheckbox';
import CtrlRadio from './control/radio/ctrlRadio';
import CtrlSelect from './control/select/ctrlSelect';
import CtrlSwitch from './control/switch/ctrlSwitch';
import CtrlDate from './control/date/ctrlDate';
import CtrlDateRange from './control/date/ctrlDateRange';
import CtrlTime from './control/time/ctrlTime';
import CtrlTimeRange from './control/time/ctrlTimeRange';
import CtrlLink from './control/link/ctrlLink';
import CtrlUpload from './control/upload/ctrlUpload';

// 组件映射
const CtrlTypeMap = new Map<string, React.FC<any>>([
  [Ctrl.Text, CtrlText],
  [Ctrl.Button, CtrlButton],
  [Ctrl.Input, CtrlInput],
  [Ctrl.Select, CtrlSelect],
  [Ctrl.Switch, CtrlSwitch],
  [Ctrl.Radio, CtrlRadio],
  [Ctrl.Checkbox, CtrlCheckbox],
  [Ctrl.Date, CtrlDate],
  [Ctrl.DateRange, CtrlDateRange],
  [Ctrl.Time, CtrlTime],
  [Ctrl.TimeRange, CtrlTimeRange],
  [Ctrl.Link, CtrlLink],
  [Ctrl.Upload, CtrlUpload],
]);

const CtrlFactory: React.FC<SysCtrlProps<CtrlStructType>> = (props) => {
  const type = get(props, 'ctrl.type', Ctrl.Text);
  let comp = CtrlTypeMap.get(type);
  if (isUndefined(comp)) {
    comp = CtrlText;
  }
  return React.createElement(comp, props);
};

export default CtrlFactory;
