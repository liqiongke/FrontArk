import { isFunction, isUndefined } from 'lodash';
import { useMemoizedFn, useSafeState } from 'ahooks';
import { Typography } from 'antd';
import { SysCtrlProps } from '../interface';
import { CtrlLinkProps } from './interface';
import './index.less';
import { useEffect } from 'react';
import { OptionItem } from '@/interface';

const { Link } = Typography;

const CtrlLink: React.FC<SysCtrlProps<CtrlLinkProps>> = (props) => {
  const { ctrl } = props;
  const [href, setHref] = useSafeState<OptionItem>();

  useEffect(() => {
    if (isUndefined(ctrl?.href)) {
      return;
    }
    setHref(isFunction(ctrl.href) ? ctrl.href() : ctrl.href);
  }, [ctrl]);

  if (isUndefined(ctrl)) {
    return null;
  }

  const handleClick = useMemoizedFn(async () => {
    if (href?.value) {
      window.open(href.value.toString(), '_blank');
    }
  });

  return (
    <div className="ctrl-link">
      <Link onClick={handleClick}>{href?.label || '链接'}</Link>
    </div>
  );
};

export default CtrlLink;
