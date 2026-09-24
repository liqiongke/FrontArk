import { isFunction, isUndefined } from 'lodash';
import { useMemoizedFn, useSafeState } from 'ahooks';
import { type SysCtrlProps } from '../interface';
import { type CtrlLinkProps } from './interface';
import { useEffect } from 'react';
import { type OptionItem } from '@/interface';

const CtrlLink: React.FC<SysCtrlProps<CtrlLinkProps>> = (props) => {
  const { ctrl } = props;
  const [href, setHref] = useSafeState<OptionItem>();

  useEffect(() => {
    if (isUndefined(ctrl?.href)) {
      return;
    }
    setHref(isFunction(ctrl.href) ? ctrl.href() : ctrl.href);
  }, [ctrl]);

  const handleClick = useMemoizedFn(async () => {
    if (href?.value) {
      window.open(href.value.toString(), '_blank');
    }
  });

  if (isUndefined(ctrl)) {
    return null;
  }

  return (
    <div className="ctrl-link inline-flex">
      <a
        className="text-primary underline-offset-4 hover:underline cursor-pointer"
        onClick={handleClick}
      >
        {href?.label || '链接'}
      </a>
    </div>
  );
};

export default CtrlLink;
