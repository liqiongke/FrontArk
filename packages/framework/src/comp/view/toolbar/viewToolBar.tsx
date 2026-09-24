import CtrlFactory from '@/comp/ctrlFactory';
import { useView } from '@/stores/store/hooks/useView';
import { type SysViewProps, ViewType } from '@view/interface';
import { type ViewToolBarProps } from './interface';

const ViewToolBar: React.FC<SysViewProps> = (props) => {
  const [view] = useView<ViewToolBarProps>(props.viewId);
  const { items } = view;

  return (
    <div className="view-toolbar-container">
      <div className="view-toolbar-space flex flex-wrap items-center gap-2">
        {items?.map((item, index) => (
          <CtrlFactory key={index} ctrl={item} sourceView={ViewType.Toolbar} />
        ))}
      </div>
    </div>
  );
};

export default ViewToolBar;
